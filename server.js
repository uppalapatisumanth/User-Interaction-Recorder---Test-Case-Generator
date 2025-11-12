const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Global CORS (no wildcards)
app.use(cors({
  origin: '*', // allow all origins
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

const actionsStore = [];
const testCasesStore = [];

// --- helpers ---
function classify(action) {
  if (action.type === "input") {
    if (!action.value) return "Negative";
    if (action.value.length > 50) return "Boundary";
    return "Positive";
  }
  if (action.type === "formSubmit") return "Functional";
  if (action.type === "navigation") return "UI";
  return "Functional";
}

function expected(action) {
  switch (action.type) {
    case "click": return "Element should respond (open/toggle/submit).";
    case "input": return "Field should accept and validate input.";
    case "formSubmit": return "Form should submit successfully.";
    case "navigation": return "Page should load correctly.";
    default: return "Action should complete without errors.";
  }
}

function actionsToTestCases(batch) {
  return batch.map((a, i) => ({
    id: `TC-${Date.now()}-${i}`,
    step: i + 1,
    action: a.type,
    target: a.target || "",
    value: a.value ?? "",
    url: a.url || "",
    expected: expected(a),
    testType: classify(a),
    xpath: a.xpath || "N/A",
    cssSelector: a.cssSelector || "N/A",
    actual: a.actual || "",
    error: a.error || "",
    timestamp: a.timestamp || Date.now(),
  }));
}

// --- API routes ---
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/testcases", (_req, res) => {
  res.json(testCasesStore);
});

app.post("/actions", (req, res) => {
  const { actions } = req.body || {};
  if (!Array.isArray(actions)) {
    return res.status(400).json({ ok: false, error: "Invalid actions array" });
  }
  actionsStore.push(...actions);
  const derived = actionsToTestCases(actions);
  testCasesStore.push(...derived);
  res.json({ 
    ok: true, 
    received: actions.length, 
    totalActions: actionsStore.length,
    totalTestCases: testCasesStore.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/clear', (_req, res) => {
  actionsStore.length = 0;
  testCasesStore.length = 0;
  res.json({ ok: true, message: 'Data cleared' });
});

app.get('/export-excel', (_req, res) => {
  const excel = require('excel4node');
  const wb = new excel.Workbook();
  const ws = wb.addWorksheet('Test Cases');
  
  const headers = ['ID', 'Step', 'Action', 'Target', 'Value', 'URL', 'XPath', 'Expected', 'Type', 'Time'];
  headers.forEach((header, i) => ws.cell(1, i + 1).string(header));

  testCasesStore.forEach((tc, i) => {
    const row = i + 2;
    ws.cell(row, 1).string(tc.id);
    ws.cell(row, 2).number(tc.step);
    ws.cell(row, 3).string(tc.action);
    ws.cell(row, 4).string(tc.target || '');
    ws.cell(row, 5).string(tc.value || '');
    ws.cell(row, 6).string(tc.url || '');
    ws.cell(row, 7).string(tc.xpath || 'N/A');
    ws.cell(row, 8).string(tc.expected);
    ws.cell(row, 9).string(tc.testType);
    ws.cell(row, 10).string(new Date(tc.timestamp).toLocaleString());
  });

  const fileName = `TestCases_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
  
  wb.write(fileName, res);
});

app.post('/generate-selenium', (req, res) => {
  const outputDir = path.join(__dirname, 'generated-scripts');
  const screenshotsDir = path.join(outputDir, 'screenshots');

  // Create directories if they don't exist
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  try {
    // NOTE: This will be implemented in the next step. For now, it's a placeholder.
    const scriptContent = generateSeleniumScript(testCasesStore, 'screenshots');
    const fileName = `test_suite_${Date.now()}.py`;
    const scriptPath = path.join(outputDir, fileName);
    fs.writeFileSync(scriptPath, scriptContent);

    res.json({
      ok: true,
      message: 'Selenium script generated successfully.',
      filePath: scriptPath,
      folderPath: outputDir
    });
  } catch (error) {
    console.error('Error generating Selenium script:', error);
    res.status(500).json({ ok: false, error: 'Failed to generate Selenium script.' });
  }
});

function generateSeleniumScript(testCases, screenshotsSubDir) {
  const imports = `
import unittest
import time
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

class GeneratedTestSuite(unittest.TestCase):
    def setUp(self):
        self.driver = webdriver.Chrome()
        self.driver.implicitly_wait(10)
        self.screenshots_dir = "${screenshotsSubDir}"
        self.debug_dir = "debug"
        if not os.path.exists(self.debug_dir):
            os.makedirs(self.debug_dir)

    def tearDown(self):
        self.driver.quit()

    def find_element_with_retry(self, wait, step_num, xpath, css_selector):
        try:
            # First, try with XPath, waiting for the element to be clickable
            return wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
        except TimeoutException:
            print(f"Step {step_num}: Could not find element with XPath: {xpath}. Retrying with CSS selector.")
            try:
                # Fallback to CSS selector
                return wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, css_selector)))
            except TimeoutException:
                # If both fail, dump page source and fail the test
                page_source_path = os.path.join(self.debug_dir, f"page_source_step_{step_num}.html")
                with open(page_source_path, "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)

                print(f"\\n--- DEBUGGING HELP ---")
                print(f"Error in step {step_num}: Element not found or not clickable with either XPath or CSS selector.")
                print(f"Attempted XPath: {xpath}")
                print(f"Attempted CSS Selector: {css_selector}")
                print(f"The page source at the time of failure has been saved to: {page_source_path}")
                print(f"----------------------\\n")

                raise

    def test_recorded_flow(self):
        driver = self.driver
        wait = WebDriverWait(driver, 15)
`;

  const steps = testCases.map((tc, i) => {
    const stepNum = i + 1;
    let stepCode = `
        # Step ${stepNum}: ${tc.action} on target "${tc.target}"
        # URL: ${tc.url}
`;

    if (tc.action === 'navigation') {
      stepCode += `        driver.get("${tc.url}")\n`;
      stepCode += `        time.sleep(1) # Wait for page to stabilize\n`;
    } else {
      const xpath = tc.xpath.replace(/'/g, "\\'");
      const cssSelector = tc.cssSelector.replace(/'/g, "\\'");
      stepCode += `
        try:
            element = self.find_element_with_retry(wait, ${stepNum}, '${xpath}', '${cssSelector}')
`;
      if (tc.action === 'click') {
        stepCode += `            element.click()\n`;
      } else if (tc.action === 'input') {
        stepCode += `            element.clear()\n`;
        stepCode += `            element.send_keys("${tc.value.replace(/"/g, '\\"')}")\n`;
      }
      stepCode += `
            driver.save_screenshot(f"{self.screenshots_dir}/${stepNum}_${tc.action}.png")
        except (TimeoutException, NoSuchElementException) as e:
            error_screenshot_path = f"{self.screenshots_dir}/${stepNum}_${tc.action}_error.png"
            driver.save_screenshot(error_screenshot_path)
            self.fail(f"Test failed at step ${stepNum}. See debug info above. Screenshot: {error_screenshot_path}")
`;
    }
    return stepCode;
  }).join('');

  const suite = `
if __name__ == "__main__":
    unittest.main()
`;

  return imports + steps + suite;
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
