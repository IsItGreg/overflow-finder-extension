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
})();
