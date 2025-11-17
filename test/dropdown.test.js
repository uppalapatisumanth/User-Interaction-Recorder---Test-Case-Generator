
const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Mock a DOM environment for testing
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <select id="dropdown">
        <option value="1">Option 1</option>
        <option value="2" selected>Option 2</option>
      </select>
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
describe('Dropdown Handling', () => {
  let capturedAction = null;

  before(() => {
    UIR_RECORDER.send = (action) => {
      capturedAction = action;
    };
  });

  beforeEach(() => {
    capturedAction = null;
  });

  it('should capture select action with correct details', () => {
    const el = document.getElementById('dropdown');
    el.selectedIndex = 0; // Simulate user selecting the first option
    UIR_RECORDER.captureInput({ target: el });

    assert.strictEqual(capturedAction.type, 'select');
    assert.strictEqual(capturedAction.value, '1');
    assert.strictEqual(capturedAction.text, 'Option 1');
    assert.strictEqual(capturedAction.index, 0);
  });
});
