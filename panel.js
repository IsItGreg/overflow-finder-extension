const $ = (sel) => document.querySelector(sel);
const scanBtn = $("#scan");
const axisSel = $("#axis");
const status = $("#status");
const viewportEl = $("#viewport");
const emptyEl = $("#empty");
const resultsEl = $("#results");
const filterBar = $("#filter-bar");

let scanScript = null;
let overlayScript = null;
let lastViewport = null;
let lastCulprits = [];
let activeFilter = "all";
let groupingEnabled = true;

// Structural signature: culprits with the same kind, axis, tag and class list
// are "basically the same" (e.g. every row of a list). Elements with an id are
// unique, so each stays in its own group.
function groupKey(c) {
  if (c.id) return "id:" + c.index;
  return [c.kind, c.axis, c.tagName, (c.classes || []).join(".")].join("|");
}

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

function buildMeta(c, members) {
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

  if (members && members.length > 1) {
    const overflows = members.map((m) => m.overflowPx);
    const min = Math.min(...overflows);
    const max = Math.max(...overflows);
    const matchLbl = document.createElement("span");
    matchLbl.className = "meta-label";
    matchLbl.textContent = "Matches:";
    const matchVal = document.createElement("span");
    matchVal.className = "meta-value";
    matchVal.textContent =
      `${members.length} similar elements` +
      (min === max ? ` (each +${max}px)` : ` (+${min}–${max}px)`);
    meta.append(matchLbl, matchVal);
  }

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
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-btn action-toggle";
  deleteBtn.dataset.action = "toggleDelete";
  deleteBtn.dataset.index = String(index);
  deleteBtn.textContent = "Delete";
  deleteBtn.title = "Remove this element from the DOM (you can restore it after)";
  actions.append(scrollBtn, inspectBtn, deleteBtn);
  return actions;
}

function buildGroupActions(repIndex, members) {
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const indices = members.map((m) => m.index).join(",");

  const scrollBtn = document.createElement("button");
  scrollBtn.className = "action-btn";
  scrollBtn.dataset.action = "scroll";
  scrollBtn.dataset.index = String(repIndex);
  scrollBtn.textContent = "Scroll to";
  scrollBtn.title = "Scroll to the largest element in this group";

  const inspectBtn = document.createElement("button");
  inspectBtn.className = "action-btn";
  inspectBtn.dataset.action = "inspect";
  inspectBtn.dataset.index = String(repIndex);
  inspectBtn.textContent = "Inspect";
  inspectBtn.title = "Select the largest element in this group in the Elements panel";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-btn action-toggle";
  deleteBtn.dataset.action = "deleteGroup";
  deleteBtn.dataset.indices = indices;
  deleteBtn.textContent = `Delete all ${members.length}`;
  deleteBtn.title = "Remove every element in this group from the DOM (restorable)";

  const expandBtn = document.createElement("button");
  expandBtn.className = "action-btn expand-btn";
  expandBtn.dataset.action = "expand";
  expandBtn.textContent = `Show ${members.length}`;
  expandBtn.title = "List the individual elements in this group";

  actions.append(scrollBtn, inspectBtn, deleteBtn, expandBtn);
  return actions;
}

function buildSublist(members) {
  const sub = document.createElement("div");
  sub.className = "sublist hidden";
  for (const m of members) {
    const row = document.createElement("div");
    row.className = "subrow";
    row.dataset.index = String(m.index);

    const ov = document.createElement("span");
    ov.className = "subrow-overflow";
    ov.textContent = `+${m.overflowPx}px`;

    const size = document.createElement("span");
    size.className = "subrow-size";
    size.textContent = `${m.rect.width} × ${m.rect.height}px`;

    const acts = document.createElement("div");
    acts.className = "subrow-actions";
    for (const [action, label] of [["scroll", "Scroll to"], ["inspect", "Inspect"], ["toggleDelete", "Delete"]]) {
      const b = document.createElement("button");
      b.className = "action-btn" + (action === "toggleDelete" ? " action-toggle" : "");
      b.dataset.action = action;
      b.dataset.index = String(m.index);
      b.textContent = label;
      acts.appendChild(b);
    }

    row.append(ov, size, acts);
    sub.appendChild(row);
  }
  return sub;
}

function buildCard(members) {
  const rep = members.reduce((a, b) => (b.overflowPx > a.overflowPx ? b : a), members[0]);
  const n = members.length;
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.index = String(rep.index);

  const header = document.createElement("div");
  header.className = "card-header";
  const axisTag = document.createElement("span");
  axisTag.className = "axis-tag";
  axisTag.textContent = rep.axis === "x" ? "X" : "Y";
  const overflow = document.createElement("span");
  overflow.className = "overflow-px";
  overflow.textContent = `+${rep.overflowPx}px overflow`;
  header.append(axisTag, overflow);

  if (rep.kind === "scroll" || rep.kind === "scroll-content" || rep.kind === "clip") {
    const kindTag = document.createElement("span");
    kindTag.className = "kind-tag kind-tag-" + rep.kind.replace("scroll-content", "scrollcontent");
    if (rep.kind === "scroll") {
      kindTag.textContent = "scroll container";
      kindTag.title = "This element has overflow:auto or overflow:scroll, and its content is wider than its visible area — produces an internal scrollbar.";
    } else if (rep.kind === "scroll-content") {
      kindTag.textContent = "intrinsic width";
      kindTag.title = "This element sits inside a scroll container and its intrinsic layout is wider than the space it has — it's what's actually forcing the container to scroll.";
    } else {
      kindTag.textContent = "clipped content";
      kindTag.title = "This element has overflow:hidden or overflow:clip, an explicit width/height, and content larger than that — the overflowing content is silently cut off.";
    }
    header.appendChild(kindTag);
  }

  if (n > 1) {
    const badge = document.createElement("span");
    badge.className = "count-badge";
    badge.textContent = "×" + n;
    badge.title = `${n} elements with the same tag, classes, and overflow type`;
    header.appendChild(badge);
  }

  card.append(header, buildElementMarkup(rep), buildMeta(rep, members));
  if (n > 1) {
    card.append(buildGroupActions(rep.index, members));
    card.append(buildSublist(members));
  } else {
    card.append(buildActions(rep.index));
  }
  return card;
}

function updateFilterBar(culprits) {
  if (!culprits.length) {
    filterBar.classList.add("hidden");
    return;
  }
  filterBar.classList.remove("hidden");
  const counts = { all: culprits.length, viewport: 0, clip: 0, scroll: 0, "scroll-content": 0 };
  for (const c of culprits) counts[c.kind] = (counts[c.kind] || 0) + 1;
  filterBar.querySelectorAll(".filter-chip").forEach((chip) => {
    const kind = chip.dataset.kind;
    const count = counts[kind] || 0;
    chip.querySelector(".count").textContent = String(count);
    chip.classList.toggle("active", kind === activeFilter);
    chip.classList.toggle("empty", kind !== "all" && count === 0);
  });
}

function renderCards(culprits) {
  resultsEl.innerHTML = "";
  const filtered = activeFilter === "all" ? culprits : culprits.filter((c) => c.kind === activeFilter);
  if (filtered.length === 0) {
    resultsEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    emptyEl.textContent = culprits.length === 0
      ? "No overflow detected on this page."
      : `No ${activeFilter === "scroll-content" ? "intrinsic-width" : activeFilter} culprits.`;
    setStatus(culprits.length === 0 ? "Done — no overflow." : "");
    return;
  }
  emptyEl.classList.add("hidden");
  resultsEl.classList.remove("hidden");

  let groups;
  if (groupingEnabled) {
    const map = new Map();
    for (const c of filtered) {
      const k = groupKey(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    groups = Array.from(map.values());
  } else {
    groups = filtered.map((c) => [c]);
  }

  for (const members of groups) {
    resultsEl.appendChild(buildCard(members));
  }

  const groupCount = groups.length;
  const nWord = `${filtered.length} culprit${filtered.length === 1 ? "" : "s"}`;
  if (groupingEnabled && groupCount < filtered.length) {
    setStatus(`${nWord} in ${groupCount} group${groupCount === 1 ? "" : "s"}.`);
  } else {
    setStatus(`Found ${nWord}.`);
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
    lastCulprits = result.culprits || [];
    renderViewport(lastViewport);
    updateFilterBar(lastCulprits);
    renderCards(lastCulprits); // owns the results status line
    updateRestoreAllVisibility();
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

function applyDeletedState(scope, deleted) {
  const isSub = scope.classList.contains("subrow");
  scope.classList.toggle(isSub ? "subrow-deleted" : "card-deleted", deleted);
  const btn = isSub
    ? scope.querySelector("button.action-toggle")
    : scope.querySelector(":scope > .card-actions button.action-toggle");
  if (btn) btn.textContent = deleted ? "Restore" : "Delete";
  updateRestoreAllVisibility();
}

function doToggleDelete(scope, i) {
  evalInPage(`window.__overflowFinder.toggleDelete(${i})`)
    .then((res) => {
      if (!res || !res.ok) {
        const why = res && res.reason ? ` (${res.reason})` : "";
        setStatus("Could not toggle — element may have been removed from the DOM" + why + ".", true);
        return;
      }
      applyDeletedState(scope, !!res.deleted);
    })
    .catch((err) => {
      setStatus("Could not toggle: " + err.message, true);
    });
}

function doToggleDeleteGroup(card, indicesStr) {
  const indices = indicesStr.split(",").map(Number);
  evalInPage(`window.__overflowFinder.toggleDeleteGroup(${JSON.stringify(indices)})`)
    .then((res) => {
      if (!res || !res.ok) {
        setStatus("Could not toggle group — elements may have been removed.", true);
        return;
      }
      card.classList.toggle("card-deleted", !!res.deleted);
      const gbtn = card.querySelector(':scope > .card-actions button[data-action="deleteGroup"]');
      if (gbtn) gbtn.textContent = (res.deleted ? "Restore all " : "Delete all ") + indices.length;
      card.querySelectorAll(".subrow").forEach((sr) => sr.classList.toggle("subrow-deleted", !!res.deleted));
      card.querySelectorAll(".subrow button.action-toggle").forEach((b) => {
        b.textContent = res.deleted ? "Restore" : "Delete";
      });
      updateRestoreAllVisibility();
    })
    .catch((err) => {
      setStatus("Could not toggle group: " + err.message, true);
    });
}

function doRestoreAllDeleted() {
  evalInPage(`window.__overflowFinder.restoreAllDeleted()`)
    .then((res) => {
      const n = (res && res.restored) || 0;
      resultsEl.querySelectorAll(".card.card-deleted").forEach((card) => applyDeletedState(card, false));
      setStatus(n === 0 ? "Nothing was deleted." : `Restored ${n} deleted element${n === 1 ? "" : "s"}.`);
      updateRestoreAllVisibility();
    })
    .catch((err) => {
      setStatus("Could not restore: " + err.message, true);
    });
}

function updateRestoreAllVisibility() {
  const link = document.getElementById("restore-all");
  if (!link) return;
  evalInPage(`window.__overflowFinder ? window.__overflowFinder.deletedCount() : 0`)
    .then((count) => {
      link.classList.toggle("hidden", !count);
      if (count) link.textContent = `Restore ${count} deleted ↺`;
    })
    .catch(() => {});
}

function bindCardEvents() {
  resultsEl.addEventListener("mouseover", (e) => {
    // A sub-row highlights its own element; otherwise the card's representative.
    const idxEl = e.target.closest(".subrow") || e.target.closest(".card");
    if (!idxEl) return;
    const i = Number(idxEl.dataset.index);
    evalInPage(`window.__overflowFinder.highlightIndex(${i})`).catch(() => {});
  });
  resultsEl.addEventListener("mouseleave", () => {
    evalInPage(`window.__overflowFinder.clearHighlight()`).catch(() => {});
  });
  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button.action-btn");
    if (btn) {
      const action = btn.dataset.action;
      const card = btn.closest(".card");
      if (action === "expand") {
        const sub = card.querySelector(".sublist");
        const open = !sub.classList.toggle("hidden");
        btn.classList.toggle("open", open);
        btn.textContent = (open ? "Hide " : "Show ") + card.querySelectorAll(".subrow").length;
        return;
      }
      if (action === "deleteGroup") {
        doToggleDeleteGroup(card, btn.dataset.indices);
        return;
      }
      const i = Number(btn.dataset.index);
      const scope = btn.closest(".subrow") || card;
      if (action === "scroll") doScrollTo(i);
      else if (action === "inspect") doInspect(i);
      else if (action === "toggleDelete") doToggleDelete(scope, i);
      return;
    }
    const idxEl = e.target.closest(".subrow") || e.target.closest(".card");
    if (!idxEl) return;
    doInspect(Number(idxEl.dataset.index));
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

document.getElementById("restore-all").addEventListener("click", (e) => {
  e.preventDefault();
  doRestoreAllDeleted();
});

filterBar.addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  activeFilter = chip.dataset.kind;
  updateFilterBar(lastCulprits);
  renderCards(lastCulprits);
});

const groupCheckbox = document.getElementById("group-similar");
groupCheckbox.addEventListener("change", () => {
  groupingEnabled = groupCheckbox.checked;
  renderCards(lastCulprits);
});

chrome.devtools.network.onNavigated.addListener(() => {
  lastViewport = null;
  lastCulprits = [];
  renderViewport(null);
  resultsEl.innerHTML = "";
  resultsEl.classList.add("hidden");
  emptyEl.classList.add("hidden");
  filterBar.classList.add("hidden");
  setStatus("Page navigated — click Scan to re-run.");
});
