(function () {
  const NS = (window.__overflowFinder = window.__overflowFinder || {});
  const ID = "__overflow-finder-highlight__";
  let trackingEl = null;
  let rafId = 0;

  function ensureNode() {
    let node = document.getElementById(ID);
    if (!node) {
      node = document.createElement("div");
      node.id = ID;
      node.style.cssText = [
        "position:fixed",
        "pointer-events:none",
        "z-index:2147483647",
        "outline:2px solid #ff3b30",
        "background:rgba(255,59,48,0.18)",
        "box-shadow:0 0 0 9999px rgba(0,0,0,0.04)",
        "left:-9999px",
        "top:-9999px",
        "width:0",
        "height:0",
      ].join(";");
      document.documentElement.appendChild(node);
    }
    return node;
  }

  function track(el, node) {
    if (trackingEl !== el) return;
    if (!el.isConnected) {
      NS.clearHighlight();
      return;
    }
    const rect = el.getBoundingClientRect();
    node.style.left = rect.left + "px";
    node.style.top = rect.top + "px";
    node.style.width = rect.width + "px";
    node.style.height = rect.height + "px";
    rafId = requestAnimationFrame(() => track(el, node));
  }

  NS.highlightIndex = function (i) {
    const r = NS.lastResults && NS.lastResults[i];
    if (!r || !r.el || !r.el.isConnected) {
      NS.clearHighlight();
      return;
    }
    if (rafId) cancelAnimationFrame(rafId);
    trackingEl = r.el;
    track(r.el, ensureNode());
  };

  NS.clearHighlight = function () {
    trackingEl = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    const node = document.getElementById(ID);
    if (node) node.remove();
  };

  NS._deleted = NS._deleted || new Map();

  NS.toggleDelete = function (i) {
    const r = NS.lastResults && NS.lastResults[i];
    if (!r || !r.el) return { ok: false };
    const el = r.el;
    if (NS._deleted.has(el)) {
      const slot = NS._deleted.get(el);
      if (!slot.parent || !slot.parent.isConnected) {
        NS._deleted.delete(el);
        return { ok: false, reason: "parent gone" };
      }
      const ref = slot.nextSibling && slot.nextSibling.isConnected ? slot.nextSibling : null;
      slot.parent.insertBefore(el, ref);
      NS._deleted.delete(el);
      return { ok: true, deleted: false };
    }
    if (!el.isConnected) return { ok: false };
    NS._deleted.set(el, { parent: el.parentNode, nextSibling: el.nextSibling });
    el.remove();
    NS.clearHighlight();
    return { ok: true, deleted: true };
  };

  NS.toggleDeleteGroup = function (indices) {
    const els = indices
      .map((i) => NS.lastResults && NS.lastResults[i])
      .filter((r) => r && r.el)
      .map((r) => r.el);
    const allDeleted = els.length > 0 && els.every((el) => NS._deleted.has(el));
    let changed = 0;
    if (allDeleted) {
      for (const el of els) {
        const slot = NS._deleted.get(el);
        if (slot && slot.parent && slot.parent.isConnected) {
          const ref = slot.nextSibling && slot.nextSibling.isConnected ? slot.nextSibling : null;
          slot.parent.insertBefore(el, ref);
        }
        NS._deleted.delete(el);
        changed++;
      }
      return { ok: true, deleted: false, count: changed };
    }
    for (const el of els) {
      if (NS._deleted.has(el) || !el.isConnected) continue;
      NS._deleted.set(el, { parent: el.parentNode, nextSibling: el.nextSibling });
      el.remove();
      changed++;
    }
    NS.clearHighlight();
    return { ok: true, deleted: true, count: changed };
  };

  NS.restoreAllDeleted = function () {
    let restored = 0;
    NS._deleted.forEach((slot, el) => {
      if (slot.parent && slot.parent.isConnected) {
        const ref = slot.nextSibling && slot.nextSibling.isConnected ? slot.nextSibling : null;
        slot.parent.insertBefore(el, ref);
        restored++;
      }
    });
    NS._deleted.clear();
    return { restored };
  };

  NS.deletedCount = function () {
    return NS._deleted ? NS._deleted.size : 0;
  };
})();
