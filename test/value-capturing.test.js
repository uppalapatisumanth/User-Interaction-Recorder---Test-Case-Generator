
const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Mock a DOM environment for testing
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
global.window = dom.window;
global.chrome = { runtime: { connect: () => ({ onDisconnect: { addListener: () => {} }, postMessage: () => {} }) } };
global.XPathResult = { NUMBER_TYPE: 1 };
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.HTMLSelectElement = dom.window.HTMLSelectElement;


const UIR_RECORDER = require('../contentScript');

// --- Test Cases ---
describe('Value Capturing', () => {
  let capturedAction = null;

  before(() => {
    UIR_RECORDER.send = (action) => {
      capturedAction = action;
    };
  });

  beforeEach(() => {
    capturedAction = null;
  });

  it('should capture text content on click', () => {
    const el = document.getElementById('date-picker-value');
    UIR_RECORDER.captureClick({ target: el });
    assert.strictEqual(capturedAction.value, '12/25/2025');
  });

  it('should capture selected dropdown option text', () => {
    const el = document.getElementById('dropdown');
    UIR_RECORDER.captureInput({ target: el });
    assert.strictEqual(capturedAction.value, 'Option 2');
  });

  it('should capture final text input on blur', () => {
    const el = document.getElementById('text-input');
    el.value = 'final value';
    UIR_RECORDER.captureInput({ target: el });
    assert.strictEqual(capturedAction.value, 'final value');
  });
});

// To run this test:
// 1. Install Node.js and npm
// 2. npm install mocha jsdom
// 3. Save this file as test/value-capturing.test.js
// 4. Run `npx mocha test/value-capturing.test.js` in your terminal
