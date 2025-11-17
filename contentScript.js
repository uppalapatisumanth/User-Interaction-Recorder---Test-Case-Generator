// contentScript.js
// Records actions and sends to background. Also injects a floating UI (Stop/Start + Clear).

const UIR_RECORDER = {
  init: () => {
    if (window.location.href.startsWith('http://localhost:3000')) {
      console.log('[Content] Recorder disabled on dashboard.');
      return;
    }
    UIR_RECORDER.addEventListeners();
    UIR_RECORDER.captureNavigation();
    UIR_RECORDER.injectControls();
    console.log('[Content] Recorder initialized');
  },

  // --- Utilities ---
  safeNow() {
    try { return Date.now(); } catch { return new Date().getTime(); }
  },

  toLabel(el) {
    if (!el || el.nodeType !== 1) return "";
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().replace(/\s+/g, '.')}` : "";
    return `${el.tagName}${id}${cls}`;
  },

  getXPath(el) {
    if (!el || el.nodeType !== 1) return { xpath: "N/A", validated: false, needsReview: true };

    const validate = (xpath) => {
        if (!xpath) return false;
        try {
            const count = document.evaluate(`count(${xpath})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue;
            return count === 1;
        } catch (e) {
            console.warn('[Content] XPath validation error:', e);
            return false;
        }
    };

    // --- STRATEGY 1: ID ---
    if (el.id) {
        const xpath = `//*[@id="${el.id}"]`;
        if (validate(xpath)) return { xpath, validated: true };

        // Case-insensitive ID check
        const insensitiveXpath = `//*[translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = '${el.id.toLowerCase()}']`;
        if (validate(insensitiveXpath)) return { xpath: insensitiveXpath, validated: true, needsReview: true };
    }

    // --- STRATEGY 2: STABLE ATTRIBUTES ---
    const stableAttrs = ["data-testid", "data-cy", "data-test", "name", "role", "aria-label", "alt", "title", "placeholder", "type"];
    for (const attr of stableAttrs) {
        const val = el.getAttribute(attr);
        if (val) {
            const xpath = `//${el.tagName.toLowerCase()}[@${attr}="${val}"]`;
            if (validate(xpath)) return { xpath, validated: true };
        }
    }
    const dataAttrs = Array.from(el.attributes).filter(a => a.name.startsWith('data-'));
    for (const attr of dataAttrs) {
        const xpath = `//${el.tagName.toLowerCase()}[@${attr.name}="${attr.value}"]`;
        if (validate(xpath)) return { xpath, validated: true };
    }

    // --- STRATEGY 3: MULTI-ATTRIBUTE COMBINATION ---
    const multiAttr = stableAttrs.map(attr => {
        const val = el.getAttribute(attr);
        return val ? `[@${attr}="${val}"]` : '';
    }).join('');
    if (multiAttr) {
        const xpath = `//${el.tagName.toLowerCase()}${multiAttr}`;
        if (validate(xpath)) return { xpath, validated: true };
    }

    // --- STRATEGY 3: TEXT CONTENT ---
    const text = el.textContent.trim();
    if (text) {
        let xpath = `//${el.tagName.toLowerCase()}[normalize-space(.)="${text}"]`;
        if (validate(xpath)) return { xpath, validated: true };

        if (el.children.length > 0) {
            xpath = `//${el.tagName.toLowerCase()}[contains(normalize-space(.), "${text}")]`;
            if (validate(xpath)) return { xpath, validated: true, needsReview: true };
        }
    }

    // --- STRATEGY 4: RELATIVE & ABSOLUTE (FALLBACK) ---
    const getPositionalPath = (node, stopNode) => {
        const parts = [];
        let current = node;
        while (current && current !== stopNode) {
            let ix = 1;
            let sib = current.previousElementSibling;
            while (sib) {
                if (sib.tagName === current.tagName) ix++;
                sib = sib.previousElementSibling;
            }
            parts.unshift(`${current.tagName.toLowerCase()}[${ix}]`);
            current = current.parentElement;
        }
        return parts.join('/');
    };

    let ancestor = el.parentElement;
    while(ancestor) {
        const ancestorId = ancestor.id;
        if (ancestorId) {
            const ancestorXPath = `//*[@id="${ancestorId}"]`;
            const relativePath = getPositionalPath(el, ancestor);
            const xpath = `${ancestorXPath}//${relativePath}`;
            if (validate(xpath)) return { xpath, validated: true };
        }
        if (ancestor === document.body) break;
        ancestor = ancestor.parentElement;
    }

    const absolutePath = '/' + getPositionalPath(el, null);
    if(validate(absolutePath)) {
        return { xpath: absolutePath, validated: true, needsReview: true };
    }

    return { xpath: "N/A", validated: false, needsReview: true };
  },

  getCssSelector(el) {
    if (!el || el.nodeType !== 1) return "N/A";

    const validate = (selector) => {
        if (!selector) return false;
        try {
            return document.querySelectorAll(selector).length === 1;
        } catch (e) {
            return false;
        }
    };

    // --- STRATEGY 1: ID ---
    if (el.id) {
        const selector = `#${el.id}`;
        if (validate(selector)) return selector;
    }

    // --- STRATEGY 2: STABLE ATTRIBUTES ---
    const stableAttrs = ["data-testid", "data-cy", "data-test", "name", "role"];
    for (const attr of stableAttrs) {
        const val = el.getAttribute(attr);
        if (val) {
            const selector = `${el.tagName.toLowerCase()}[${attr}="${val}"]`;
            if (validate(selector)) return selector;
        }
    }

    // --- STRATEGY 3: CLASS NAMES ---
    if (el.className && typeof el.className === 'string') {
        const stableClasses = el.className.split(' ').filter(c => c && !/^[0-9]/.test(c));
        if (stableClasses.length > 0) {
            const selector = `.${stableClasses.join('.')}`;
            if (validate(selector)) return selector;
        }
    }

    return "N/A";
  },

  currentUrl() {
    try { return location.href; } catch { return ''; }
  },

  port: null,

  connect() {
    try {
      this.port = chrome.runtime.connect({ name: "content-script" });
      this.port.onDisconnect.addListener(() => {
        this.port = null;
        console.warn('[Content] Connection to background script lost. Re-establishing...');
      });
    } catch (e) {
      console.warn('[Content] Could not connect to background script:', e);
    }
  },

  send(action) {
    const payload = { type: 'record-action', action };
    if (UIR_RECORDER.port) {
      UIR_RECORDER.port.postMessage(payload);
    } else {
      console.warn('[Content] No active port to background script. Falling back to direct POST.');
      UIR_RECORDER.sendDirectToServer([action]);
    }
  },

  sendDirectToServer(actions) {
    console.log('[Content] Sending directly to server:', actions);
    fetch('http://localhost:3000/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions })
    })
    .then(response => response.json())
    .then(data => console.log('[Content] Server response:', data))
    .catch(err => console.warn('[Content] direct POST failed:', err));
  },

  // --- Event capture ---
  captureClick(e) {
    if (this.stopped) return;
    const el = e.target;
    const { xpath, validated, needsReview } = this.getXPath(el);
    const cssSelector = this.getCssSelector(el);

    let value = '';
    if (el.hasAttribute('value')) {
        value = el.getAttribute('value');
    } else if (el.textContent) {
        value = el.textContent.trim();
    }

    const action = {
      type: 'click',
      target: UIR_RECORDER.toLabel(el),
      value: value,
      url: UIR_RECORDER.currentUrl(),
      xpath,
      cssSelector,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: UIR_RECORDER.safeNow()
    };
    console.log('[Content] Click action:', action);
    UIR_RECORDER.send(action);
  },

  captureInput(e) {
    if (this.stopped) return;
    const el = e.target;

    if (el.tagName === 'SELECT') {
      const selectedOption = el.options[el.selectedIndex];
      if (selectedOption) {
        const action = {
          type: 'select',
          target: this.toLabel(el),
          value: selectedOption.value,
          text: selectedOption.text,
          index: el.selectedIndex,
          url: this.currentUrl(),
          xpath: this.getXPath(el).xpath,
          cssSelector: this.getCssSelector(el),
          timestamp: this.safeNow()
        };
        this.send(action);
      }
      return;
    }

    let value = el.value ?? '';
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const { xpath, validated, needsReview } = this.getXPath(el);
    const cssSelector = this.getCssSelector(el);
    const action = {
      type: 'input',
      target: this.toLabel(el),
      value: value,
      url: UIR_RECORDER.currentUrl(),
      xpath,
      cssSelector,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: UIR_RECORDER.safeNow()
    };
    console.log('[Content] Input action:', action);
    UIR_RECORDER.send(action);
  },

  captureSubmit(e) {
    if (this.stopped) return;
    const el = e.target;
    const { xpath, validated, needsReview } = this.getXPath(el);
    const cssSelector = getCssSelector(el);
    const action = {
      type: 'formSubmit',
      target: UIR_RECORDER.toLabel(el),
      value: '',
      url: UIR_RECORDER.currentUrl(),
      xpath,
      cssSelector,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: UIR_RECORDER.safeNow()
    };
    console.log('[Content] Form submit action:', action);
    UIR_RECORDER.send(action);
  },

  captureNavigation() {
    if (this.stopped) return;
    const action = {
      type: 'navigation',
      target: '',
      value: '',
      url: UIR_RECORDER.currentUrl(),
      xpath: 'N/A',
      cssSelector: 'N/A',
      xpathValidated: true,
      xpathNeedsReview: false,
      timestamp: UIR_RECORDER.safeNow()
    };
    console.log('[Content] Navigation action:', action);
    UIR_RECORDER.send(action);
  },

  // --- Floating controls ---
  injectControls() {
    if (document.getElementById('uir-recorder-controls')) return;
    const root = document.createElement('div');
    root.id = 'uir-recorder-controls';
    root.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;display:flex;gap:8px;font-family:Arial,sans-serif';

    const btnStop = document.createElement('button');
    btnStop.textContent = 'Recording: ON';
    Object.assign(btnStop.style, { padding: '6px 10px', border: 'none', borderRadius: '4px', background: '#28a745', color: '#fff' });
    btnStop.onclick = () => {
      stopped = !stopped;
      btnStop.textContent = stopped ? 'Recording: OFF' : 'Recording: ON';
      btnStop.style.background = stopped ? '#dc3545' : '#28a745';
      console.log('[Content] Recording state:', stopped ? 'OFF' : 'ON');
    };

    const btnClear = document.createElement('button');
    btnClear.textContent = 'Clear Server';
    Object.assign(btnClear.style, { padding: '6px 10px', border: 'none', borderRadius: '4px', background: '#6c757d', color: '#fff' });
    btnClear.onclick = async () => {
      try {
        if (chrome?.runtime?.id) {
          chrome.runtime.sendMessage({ type: 'clear-server' }, (res) => {
            console.log('[Content] Clear server response:', res);
          });
        } else {
          const r = await fetch('http://localhost:3000/clear', { method: 'POST' });
          console.log('[Content] Server clear response (fallback):', await r.json());
        }
      } catch (e) {
        console.warn('[Content] Clear server failed:', e);
      }
    };
    
    // Add close button
    const btnClose = document.createElement('button');
    btnClose.textContent = 'X';
    Object.assign(btnClose.style, { 
      padding: '6px 10px', 
      border: 'none', 
      borderRadius: '4px', 
      background: '#dc3545', 
      color: '#fff',
      fontWeight: 'bold'
    });
    btnClose.onclick = () => {
      root.remove();
      controlsVisible = false;
      // Add a small button to restore controls
      addRestoreButton();
    };
    
    root.appendChild(btnStop);
    root.appendChild(btnClear);
    root.appendChild(btnClose);

    const attach = () => {
      if (document.body) {
        document.body.appendChild(root);
        console.log('[Content] Controls injected');
      } else {
        setTimeout(attach, 100);
      }
    };
    attach();
  },
  
  // Add a small button to restore controls when they're closed
  addRestoreButton() {
    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = '⚙️';
    restoreBtn.id = 'uir-restore-button';
    Object.assign(restoreBtn.style, {
      position: 'fixed',
      zIndex: '2147483647',
      right: '12px',
      bottom: '12px',
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      background: '#007bff',
      color: '#fff',
      border: 'none',
      cursor: 'pointer',
      fontSize: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    });
    
    restoreBtn.onclick = () => {
      restoreBtn.remove();
      controlsVisible = true;
      injectControls();
    };
    
    document.body.appendChild(restoreBtn);
  },

  // Add this debounce function at the top with other utility functions
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },
  
  // Create a debounced version of captureInput
  debouncedCaptureInput() {
    return this.debounce((e) => {
      this.captureInput(e);
    }, 700);
  },
  
  addEventListeners() {
    window.addEventListener('click', UIR_RECORDER.captureClick, true);
    window.addEventListener('change', UIR_RECORDER.captureInput, true);
    window.addEventListener('submit', UIR_RECORDER.captureSubmit, true);
    window.addEventListener('keyup', UIR_RECORDER.debouncedCaptureInput(), true);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIR_RECORDER;
} else {
  UIR_RECORDER.init();
}