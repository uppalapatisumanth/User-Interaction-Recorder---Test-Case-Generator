const express = require("express");
const cors = require("cors");
const path = require("path");

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
