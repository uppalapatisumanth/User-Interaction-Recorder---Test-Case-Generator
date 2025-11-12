
// This is a conceptual test and will not run in the current environment.
// It is intended to demonstrate the testing approach for the value capturing logic.

const assert = require('assert');

// Mock a DOM environment for testing
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="date-picker-value">12/25/2025</div>
      <select id="dropdown">
        <option value="1">Option 1</option>
        <option value="2" selected>Option 2</option>
      </select>
      <input type="text" id="text-input" value="initial" />
    </body>
  </html>
`);
global.document = dom.window.document;

// Mock the send function
let capturedAction = null;
function send(action) {
  capturedAction = action;
}

// The functions to be tested (copied from contentScript.js)
function toLabel(el) {
    if (!el || el.nodeType !== 1) return "";
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().replace(/\s+/g, '.')}` : "";
    return `${el.tagName}${id}${cls}`;
}
function getXPath(el) { return { xpath: "mock-xpath", validated: true }; }
function currentUrl() { return "mock-url"; }
function safeNow() { return 12345; }

function captureClick(e) {
    const el = e.target;
    const { xpath, validated, needsReview } = getXPath(el);
    let value = '';
    if (el.hasAttribute('value')) {
        value = el.getAttribute('value');
    } else if (el.textContent) {
        value = el.textContent.trim();
    }
    const action = {
      type: 'click',
      target: toLabel(el),
      value: value,
      url: currentUrl(),
      xpath,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: safeNow()
    };
    send(action);
}

function captureInput(e) {
    const el = e.target;
    let value = el.value ?? '';
    if (el.tagName === 'SELECT') {
        const selectedOption = el.options[el.selectedIndex];
        value = selectedOption.text || selectedOption.value;
    }
    const { xpath, validated, needsReview } = getXPath(el);
    const action = {
      type: 'input',
      target: toLabel(el),
      value: value,
      url: currentUrl(),
      xpath,
      xpathValidated: validated,
      xpathNeedsReview: needsReview,
      timestamp: safeNow()
    };
    send(action);
}

// --- Test Cases ---
describe('Value Capturing', () => {
  it('should capture text content on click', () => {
    const el = document.getElementById('date-picker-value');
    captureClick({ target: el });
    assert.strictEqual(capturedAction.value, '12/25/2025');
  });

  it('should capture selected dropdown option text', () => {
    const el = document.getElementById('dropdown');
    captureInput({ target: el });
    assert.strictEqual(capturedAction.value, 'Option 2');
  });

  it('should capture final text input on blur', () => {
    const el = document.getElementById('text-input');
    el.value = 'final value';
    captureInput({ target: el });
    assert.strictEqual(capturedAction.value, 'final value');
  });
});

// To run this test:
// 1. Install Node.js and npm
// 2. npm install mocha jsdom
// 3. Save this file as test/value-capturing.test.js
// 4. Run `npx mocha test/value-capturing.test.js` in your terminal
