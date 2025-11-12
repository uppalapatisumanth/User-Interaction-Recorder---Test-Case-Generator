
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
    if (!el || el.nodeType !== 1) return { xpath: "N/A", validated: false };
    const validate = (xpath) => {
      try {
        const count = document.evaluate(`count(${xpath})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue;
        return count === 1;
      } catch (e) { return false; }
    };
    const strategies = [
      (e) => {
        if (e.id) {
          const xpath = `//*[@id="${e.id}"]`;
          if (validate(xpath)) return xpath;
        }
        return null;
      },
      (e) => {
        const dataAttrs = Array.from(e.attributes).filter(a => a.name.startsWith('data-'));
        for (const attr of dataAttrs) {
          const xpath = `//${e.tagName.toLowerCase()}[@${attr.name}="${attr.value}"]`;
          if (validate(xpath)) return xpath;
        }
        return null;
      },
      (e) => {
        const label = e.getAttribute('aria-label') || e.textContent.trim();
        if (label) {
          const xpath = `//${e.tagName.toLowerCase()}[normalize-space()="${label}"]`;
          if (validate(xpath)) return xpath;
        }
        return null;
      },
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

  it('should use aria-label', () => {
    const el = document.querySelector('[aria-label="Click me"]');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '//a[normalize-space()="Clickable"]');
  });

  it('should use name attribute', () => {
    const el = document.querySelector('[name="username"]');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '//input[@name="username"]');
  });

  it('should fall back to DOM position', () => {
    const el = document.querySelector('span');
    const { xpath } = getXPath(el);
    assert.strictEqual(xpath, '/html/body/div[4]/span[1]');
  });
});

// To run this test:
// 1. Install Node.js and npm
// 2. npm install mocha jsdom
// 3. Save this file as test/xpath-generator.test.js
// 4. Run `npx mocha test/xpath-generator.test.js` in your terminal
