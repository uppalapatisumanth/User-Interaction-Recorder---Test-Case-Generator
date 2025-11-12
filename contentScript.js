// contentScript.js
// Records actions and sends to background. Also injects a floating UI (Stop/Start + Clear).

(() => {
  let stopped = false; // toggled by the floating button
  let controlsVisible = true; // track if controls are visible

  // --- Utilities ---
  function safeNow() {
    try { return Date.now(); } catch { return new Date().getTime(); }
  }

  function toLabel(el) {
    if (!el || el.nodeType !== 1) return "";
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().replace(/\s+/g, '.')}` : "";
    return `${el.tagName}${id}${cls}`;
  }

  function getXPath(el) {
    if (!el || el.nodeType !== 1) return { xpath: "N/A", validated: false };

    // --- Helper to validate ---
    const validate = (xpath) => {
      try {
        const count = document.evaluate(`count(${xpath})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue;
        return count === 1;
      } catch (e) { return false; }
    };

    // --- Strategies (ordered by preference) ---
    const strategies = [
      // 1. ID
      (e) => {
        if (e.id) {
          const xpath = `//*[@id="${e.id}"]`;
          if (validate(xpath)) return xpath;
        }
        return null;
      },
      // 2. Data attributes
      (e) => {
        const dataAttrs = Array.from(e.attributes).filter(a => a.name.startsWith('data-'));
        for (const attr of dataAttrs) {
          const xpath = `//${e.tagName.toLowerCase()}[@${attr.name}="${attr.value}"]`;
          if (validate(xpath)) return xpath;
        }
        return null;
      },
      // 3. Aria-label or Accessible Name
      (e) => {
        const label = e.getAttribute('aria-label') || e.textContent.trim();
        if (label) {
          const xpath = `//${e.tagName.toLowerCase()}[normalize-space()="${label}"]`;
          if (validate(xpath)) return xpath;
        }
        return null;
      },
      // 4. Stable attributes
      (e) => {
        const stableAttrs = ["name", "role", "alt", "placeholder", "title", "type"];
        for (const attr of stableAttrs) {
          const val = e.getAttribute(attr);
          if (val) {
            const xpath = `//${e.tagName.toLowerCase()}[@${attr}="${val}"]`;
            if (validate(xpath)) return xpath;
          }
        }
        return null;
      },
      // 5. DOM position (fallback)
      (e) => {
        const parts = [];
        let node = e;
        while (node && node.nodeType === 1 && node !== document.documentElement) {
          let ix = 1;
          let sib = node.previousElementSibling;
          while (sib) {
            if (sib.tagName === node.tagName) ix++;
            sib = sib.previousElementSibling;
          }
          parts.unshift(`${node.tagName.toLowerCase()}[${ix}]`);
          node = node.parentElement;
        }
        return parts.length ? '/' + parts.join('/') : null;
      }
    ];

    // --- Execute strategies ---
    for (const strategy of strategies) {
      try {
        const xpath = strategy(el);
        if (xpath) {
          const isValid = validate(xpath);
          return { xpath, validated: isValid, needsReview: !isValid };
        }
      } catch (err) {
        console.warn('[Content] XPath strategy failed:', err);
      }
    }

    return { xpath: "N/A", validated: false, needsReview: true };
  }

  function currentUrl() {
    try { return location.href; } catch { return ''; }
  }

  function send(action) {
    const payload = { type: 'record-action', action };
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage(payload, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('[Content] sendMessage error:', chrome.runtime.lastError.message);
          // Fallback to direct server communication if background script fails
          sendDirectToServer([action]);
        } else {
          console.log('[Content] Ack from background:', res);
        }
      });
    } else {
      console.warn('[Content] chrome.runtime not available — using direct POST fallback');
      sendDirectToServer([action]);
    }
  }

  function sendDirectToServer(actions) {
    console.log('[Content] Sending directly to server:', actions);
    fetch('http://localhost:3000/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions })
    })
    .then(response => response.json())
    .then(data => console.log('[Content] Server response:', data))
    .catch(err => console.warn('[Content] direct POST failed:', err));
  }

  // --- Event capture ---
  function captureClick(e) {
    if (stopped) return;
    const el = e.target;
    const { xpath, validated, needsReview } = getXPath(el);
    const action = {
      type: 'click',
      target: toLabel(el),
      value: '',
      url: currentUrl(),
      xpath,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: safeNow()
    };
    console.log('[Content] Click action:', action);
    send(action);
  }

  function captureInput(e) {
    if (stopped) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const { xpath, validated, needsReview } = getXPath(el);
    const action = {
      type: 'input',
      target: toLabel(el),
      value: el.value ?? '',
      url: currentUrl(),
      xpath,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: safeNow()
    };
    console.log('[Content] Input action:', action);
    send(action);
  }

  function captureSubmit(e) {
    if (stopped) return;
    const el = e.target;
    const { xpath, validated, needsReview } = getXPath(el);
    const action = {
      type: 'formSubmit',
      target: toLabel(el),
      value: '',
      url: currentUrl(),
      xpath,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: safeNow()
    };
    console.log('[Content] Form submit action:', action);
    send(action);
  }

  function captureNavigation() {
    if (stopped) return;
    const action = {
      type: 'navigation',
      target: '',
      value: '',
      url: currentUrl(),
      xpath: 'N/A',
      xpathValidated: true,
      xpathNeedsReview: false,
      timestamp: safeNow()
    };
    console.log('[Content] Navigation action:', action);
    send(action);
  }

  // --- Floating controls ---
  function injectControls() {
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
  }
  
  // Add a small button to restore controls when they're closed
  function addRestoreButton() {
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
  }

  // Add this debounce function at the top with other utility functions
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  // Create a debounced version of captureInput
  const debouncedCaptureInput = debounce((e) => {
    captureInput(e);
  }, 700); // Wait 500ms after the user stops typing
  
  // --- Init ---
  function init() {
    window.addEventListener('click', captureClick, true);
    window.addEventListener('change', captureInput, true);
    // Replace with debounced version
    window.addEventListener('keyup', debouncedCaptureInput, true);
    window.addEventListener('submit', captureSubmit, true);
    captureNavigation();
    injectControls();
    console.log('[Content] Recorder initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();