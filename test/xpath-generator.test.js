
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
global.window = dom.window;
global.XPathResult = { NUMBER_TYPE: 1 };

const UIR_RECORDER = require('../contentScript');

// --- Test Cases ---
describe('getXPath', () => {
  it('should prioritize ID', () => {
    const el = document.getElementById('uniqueId');
    const { xpath } = UIR_RECORDER.getXPath(el);
    assert.strictEqual(xpath, '//*[@id="uniqueId"]');
  });

  it('should use data-* attributes', () => {
    const el = document.querySelector('[data-testid="test-id"]');
    const { xpath } = UIR_RECORDER.getXPath(el);
    assert.strictEqual(xpath, '//div[@data-testid="test-id"]');
  });

  it('should use text content', () => {
    const el = document.querySelector('a');
    const { xpath } = UIR_RECORDER.getXPath(el);
    assert.strictEqual(xpath, '//a[@aria-label="Click me"]');
  });

  it('should use name attribute', () => {
    const el = document.querySelector('[name="username"]');
    const { xpath } = UIR_RECORDER.getXPath(el);
    assert.strictEqual(xpath, '//input[@name="username"]');
  });

  it('should fall back to absolute DOM position', () => {
    const el = document.querySelector('span');
    const { xpath } = UIR_RECORDER.getXPath(el);
    assert.strictEqual(xpath, '//span[normalize-space(.)="Nested"]');
  });
});

// To run this test:
// 1. Install Node.js and npm
// 2. npm install mocha jsdom
// 3. Save this file as test/xpath-generator.test.js
// 4. Run `npx mocha test/xpath-generator.test.js` in your terminal
