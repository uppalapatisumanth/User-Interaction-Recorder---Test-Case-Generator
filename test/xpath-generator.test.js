
// This is a conceptual test and will not run in the current environment.
// It is intended to demonstrate the testing approach for the XPATH generation logic.

const assert = require('assert');

// Mock a DOM environment for testing
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="uniqueId"></div>
      <div data-testid="test-id"></div>
      <a href="#" aria-label="Click me">Clickable</a>
      <input type="text" name="username" />
      <div class="dynamic-class-123"></div>
      <div><span>Nested</span></div>
    </body>
  </html>
`);
global.document = dom.window.document;

// The function to be tested (copied from contentScript.js)
function getXPath(el) {
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
}

// --- Test Cases ---
describe('getXPath', () => {
  it('should prioritize ID', () => {
    const el = document.getElementById('uniqueId');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '//*[@id="uniqueId"]');
  });

  it('should use data-* attributes', () => {
    const el = document.querySelector('[data-testid="test-id"]');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '//div[@data-testid="test-id"]');
  });

  it('should use text content', () => {
    const el = document.querySelector('a');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '//a[normalize-space(.)="Clickable"]');
  });

  it('should use name attribute', () => {
    const el = document.querySelector('[name="username"]');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '//input[@name="username"]');
  });

  it('should fall back to absolute DOM position', () => {
    const el = document.querySelector('span');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '/html[1]/body[1]/div[4]/span[1]');
  });
});

// To run this test:
// 1. Install Node.js and npm
// 2. npm install mocha jsdom
// 3. Save this file as test/xpath-generator.test.js
// 4. Run `npx mocha test/xpath-generator.test.js` in your terminal
