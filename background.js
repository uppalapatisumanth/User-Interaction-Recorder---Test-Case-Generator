// background.js (MV3 service worker)
// Batches actions and posts them to the local server.


const SERVER_BASE = "http://localhost:3000";
let queue = [];
let flushTimer = null;


function log(...args) {
console.log("[Background]", ...args);
}


chrome.runtime.onInstalled.addListener(() => log("Installed/updated"));
self.addEventListener("activate", () => log("Service worker activated"));
log("Service worker started.");


chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
try {
log("Received message:", msg);
if (!msg || typeof msg !== "object") return;


if (msg.type === "record-action" && msg.action) {
queue.push(msg.action);
scheduleFlush();
sendResponse && sendResponse({ ok: true });
return true; // keep the message channel open for async if needed
}


if (msg.type === "clear-server") {
clearServer().then((r) => sendResponse && sendResponse(r));
return true;
}


if (msg.type === "ping") {
sendResponse && sendResponse({ ok: true, ts: Date.now() });
return true;
}
} catch (e) {
log("Error in onMessage:", e);
}
});


function scheduleFlush() {
if (flushTimer) return;
flushTimer = setTimeout(flushQueue, 500);
}


async function flushQueue() {
const batch = queue.splice(0, queue.length);
flushTimer = null;
if (!batch.length) return;
try {
log(`Sending ${batch.length} actions to server...`);
const res = await fetch(`${SERVER_BASE}/actions`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ actions: batch })
});
const json = await res.json();
log("Sent OK:", json);
} catch (err) {
log("Send failed, re-queueing. Error:", err);
// put actions back to the front of the queue
queue = batch.concat(queue);
// retry later
setTimeout(scheduleFlush, 2000);
}
}


async function clearServer() {
try {
const res = await fetch(`${SERVER_BASE}/clear`, { method: "POST" });
const json = await res.json();
log("Server cleared:", json);
return json;
} catch (e) {
log("/clear failed:", e);
return { ok: false, error: String(e) };
}
}
// Remove this line: console.log("[Background] Got action:", msg.action);
