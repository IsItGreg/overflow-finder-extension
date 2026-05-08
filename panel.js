const $ = (sel) => document.querySelector(sel);
const scanBtn = $("#scan");
const axisSel = $("#axis");
const status = $("#status");
const viewportEl = $("#viewport");
const emptyEl = $("#empty");
const resultsEl = $("#results");

let scanScript = null;
let overlayScript = null;
let lastViewport = null;

async function loadScripts() {
  if (scanScript && overlayScript) return;
  const [scan, overlay] = await Promise.all([
    fetch("inject/scan.js").then((r) => r.text()),
    fetch("inject/overlay.js").then((r) => r.text()),
  ]);
  scanScript = scan;
  overlayScript = overlay;
}

function evalInPage(expression) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exceptionInfo) => {
      if (exceptionInfo && exceptionInfo.isException) {
        reject(new Error(exceptionInfo.value || exceptionInfo.description || "eval failed"));
      } else if (exceptionInfo && exceptionInfo.isError) {
        reject(new Error(exceptionInfo.code + ": " + exceptionInfo.description));
      } else {
        resolve(result);
      }
    });
  });
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function renderViewport(vp) {
  if (!vp) { viewportEl.textContent = ""; return; }
  viewportEl.textContent = `viewport: ${vp.width} × ${vp.height}px`;
}

function buildElementMarkup(c) {
  const wrap = document.createElement("div");
  wrap.className = "card-element";
  const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = c.tagName;
  wrap.appendChild(tag);
  if (c.id) {
    const id = document.createElement("span"); id.className = "id"; id.textContent = `#${c.id}`;
    wrap.appendChild(id);
  }
  if (c.classes && c.classes.length) {
    const cls = document.createElement("span"); cls.className = "cls"; cls.textContent = "." + c.classes.join(".");
    wrap.appendChild(cls);
  }
  return wrap;
}

function buildMeta(c) {
  const meta = document.createElement("div");
  meta.className = "card-meta";

  const reasonLbl = document.createElement("span");
  reasonLbl.className = "meta-label";
  reasonLbl.textContent = "Cause:";
  const reasonVal = document.createElement("span");
  reasonVal.className = "meta-value";
  if (c.reason === "unknown") reasonVal.classList.add("unknown");
  reasonVal.textContent = c.reason;

  const sizeLbl = document.createElement("span");
  sizeLbl.className = "meta-label";
  sizeLbl.textContent = "Size:";
  const sizeVal = document.createElement("span");
  sizeVal.className = "meta-value";
  sizeVal.textContent = `${c.rect.width} × ${c.rect.height}px`;

  meta.append(reasonLbl, reasonVal, sizeLbl, sizeVal);
  return meta;
}

function buildActions(index) {
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const scrollBtn = document.createElement("button");
  scrollBtn.className = "action-btn";
  scrollBtn.dataset.action = "scroll";
  scrollBtn.dataset.index = String(index);
  scrollBtn.textContent = "Scroll to";
  scrollBtn.title = "Scroll the page so this element is centered";
  const inspectBtn = document.createElement("button");
  inspectBtn.className = "action-btn";
  inspectBtn.dataset.action = "inspect";
  inspectBtn.dataset.index = String(index);
  inspectBtn.textContent = "Inspect";
  inspectBtn.title = "Select this element in the Elements panel";
  actions.append(scrollBtn, inspectBtn);
  return actions;
}

function renderCards(culprits) {
  resultsEl.innerHTML = "";
  if (culprits.length === 0) {
    resultsEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  resultsEl.classList.remove("hidden");

  for (const c of culprits) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.index = String(c.index);

    const header = document.createElement("div");
    header.className = "card-header";
    const axisTag = document.createElement("span");
    axisTag.className = "axis-tag";
    axisTag.textContent = c.axis === "x" ? "X" : "Y";
    const overflow = document.createElement("span");
    overflow.className = "overflow-px";
    overflow.textContent = `+${c.overflowPx}px overflow`;
    header.append(axisTag, overflow);

    card.append(header, buildElementMarkup(c), buildMeta(c), buildActions(c.index));
    resultsEl.appendChild(card);
  }
}

async function inject() {
  await loadScripts();
  await evalInPage(scanScript);
  await evalInPage(overlayScript);
}

async function scan() {
  scanBtn.disabled = true;
  setStatus("Scanning…");
  try {
    await inject();
    const axisChoice = axisSel.value;
    const axes = axisChoice === "both" ? ["x", "y"] : [axisChoice];
    const result = await evalInPage(`window.__overflowFinder.scan(${JSON.stringify(axes)})`);
    if (!result || typeof result !== "object") {
      throw new Error("Unexpected scan result");
    }
    lastViewport = result.viewport;
    renderViewport(lastViewport);
    renderCards(result.culprits || []);
    const n = (result.culprits || []).length;
    setStatus(n === 0 ? "Done — no overflow." : `Found ${n} culprit${n === 1 ? "" : "s"}.`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    scanBtn.disabled = false;
  }
}

function doInspect(i) {
  evalInPage(`inspect(window.__overflowFinder.lastResults[${i}].el)`).catch((err) => {
    setStatus("Could not select in Elements panel: " + err.message, true);
  });
}

function doScrollTo(i) {
  const expr = `(function(){
    var r = window.__overflowFinder && window.__overflowFinder.lastResults && window.__overflowFinder.lastResults[${i}];
    if (r && r.el) {
      r.el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      window.__overflowFinder.highlightIndex(${i});
    }
  })()`;
  evalInPage(expr).catch((err) => {
    setStatus("Could not scroll: " + err.message, true);
  });
}

function bindCardEvents() {
  resultsEl.addEventListener("mouseover", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const i = Number(card.dataset.index);
    evalInPage(`window.__overflowFinder.highlightIndex(${i})`).catch(() => {});
  });
  resultsEl.addEventListener("mouseleave", () => {
    evalInPage(`window.__overflowFinder.clearHighlight()`).catch(() => {});
  });
  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button.action-btn");
    if (btn) {
      const i = Number(btn.dataset.index);
      if (btn.dataset.action === "scroll") doScrollTo(i);
      else if (btn.dataset.action === "inspect") doInspect(i);
      return;
    }
    const card = e.target.closest(".card");
    if (!card) return;
    doInspect(Number(card.dataset.index));
  });
}

scanBtn.addEventListener("click", scan);
bindCardEvents();

const fixturesLink = document.getElementById("open-fixtures");
const fixturesUrl = chrome.runtime.getURL("test/fixtures.html");
fixturesLink.href = fixturesUrl;
fixturesLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: fixturesUrl });
});

chrome.devtools.network.onNavigated.addListener(() => {
  lastViewport = null;
  renderViewport(null);
  resultsEl.innerHTML = "";
  resultsEl.classList.add("hidden");
  emptyEl.classList.add("hidden");
  setStatus("Page navigated — click Scan to re-run.");
});
