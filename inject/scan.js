(function () {
  const NS = (window.__overflowFinder = window.__overflowFinder || {});

  function walk(root, fn) {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = it.nextNode())) {
      fn(n);
      if (n.shadowRoot) walk(n.shadowRoot, fn);
    }
  }

  function up(el) {
    return el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
  }

  function clippedByAncestor(el, axis, viewport) {
    let p = up(el);
    while (p) {
      const cs = getComputedStyle(p);
      const ov = axis === "x" ? cs.overflowX : cs.overflowY;
      if (ov === "hidden" || ov === "auto" || ov === "scroll" || ov === "clip") {
        const r = p.getBoundingClientRect();
        const far = axis === "x" ? r.right : r.bottom;
        const near = axis === "x" ? r.left : r.top;
        if (far <= viewport + 1 && near >= -1) return true;
      }
      p = up(p);
    }
    return false;
  }

  function diagnose(el, axis) {
    const cs = getComputedStyle(el);
    const reasons = [];

    if (axis === "x") {
      if (cs.width.endsWith("px")) {
        const w = parseFloat(cs.width);
        const parent = el.parentElement;
        if (parent && w > parent.clientWidth + 1) reasons.push(`width: ${cs.width}`);
      }
      if (cs.minWidth && cs.minWidth !== "0px" && cs.minWidth !== "auto") {
        reasons.push(`min-width: ${cs.minWidth}`);
      }
      if (cs.whiteSpace === "nowrap" && el.scrollWidth > el.clientWidth + 1) {
        reasons.push("white-space: nowrap");
      }
      const ml = parseFloat(cs.marginLeft);
      const mr = parseFloat(cs.marginRight);
      if (ml < 0) reasons.push(`margin-left: ${cs.marginLeft}`);
      if (mr < 0) reasons.push(`margin-right: ${cs.marginRight}`);
      if ((el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "CANVAS") &&
          (cs.maxWidth === "none" || !cs.maxWidth)) {
        reasons.push(`<${el.tagName.toLowerCase()}> with no max-width`);
      }
      if (el.tagName === "TABLE" && cs.tableLayout !== "fixed") {
        reasons.push("table-layout: auto");
      }
    } else {
      if (cs.height.endsWith("px")) {
        const h = parseFloat(cs.height);
        const parent = el.parentElement;
        if (parent && h > parent.clientHeight + 1) reasons.push(`height: ${cs.height}`);
      }
      if (cs.minHeight && cs.minHeight !== "0px" && cs.minHeight !== "auto") {
        reasons.push(`min-height: ${cs.minHeight}`);
      }
      const mt = parseFloat(cs.marginTop);
      const mb = parseFloat(cs.marginBottom);
      if (mt < 0) reasons.push(`margin-top: ${cs.marginTop}`);
      if (mb < 0) reasons.push(`margin-bottom: ${cs.marginBottom}`);
    }

    if (cs.position === "absolute" || cs.position === "fixed") {
      const docEl = document.documentElement;
      if (axis === "x") {
        if (cs.left !== "auto" && parseFloat(cs.left) > docEl.clientWidth) {
          reasons.push(`${cs.position}; left: ${cs.left}`);
        } else if (cs.right !== "auto" && parseFloat(cs.right) < 0) {
          reasons.push(`${cs.position}; right: ${cs.right}`);
        } else {
          reasons.push(cs.position);
        }
      } else {
        if (cs.top !== "auto" && parseFloat(cs.top) > docEl.clientHeight) {
          reasons.push(`${cs.position}; top: ${cs.top}`);
        } else if (cs.bottom !== "auto" && parseFloat(cs.bottom) < 0) {
          reasons.push(`${cs.position}; bottom: ${cs.bottom}`);
        } else {
          reasons.push(cs.position);
        }
      }
    }

    if (cs.transform && cs.transform !== "none") {
      const m = cs.transform.match(/matrix3?d?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
        const is3d = cs.transform.startsWith("matrix3d");
        const tx = is3d ? parts[12] : parts[4];
        const ty = is3d ? parts[13] : parts[5];
        if (axis === "x" && Math.abs(tx) > 1) reasons.push(`translateX(${tx.toFixed(0)}px)`);
        if (axis === "y" && Math.abs(ty) > 1) reasons.push(`translateY(${ty.toFixed(0)}px)`);
      }
    }

    return reasons.length ? reasons.join("; ") : "unknown";
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&");
  }

  function buildSelector(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) return `#${cssEscape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList && cur.classList.length) {
        part += "." + Array.from(cur.classList).slice(0, 2).map(cssEscape).join(".");
      } else {
        const parent = cur.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
      if (parts.length >= 4) break;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }

  function scanAxis(axis) {
    if (!document.body) return [];
    const docEl = document.documentElement;
    const viewport = axis === "x" ? docEl.clientWidth : docEl.clientHeight;

    const candidates = [];
    walk(document.body, (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const far = axis === "x" ? r.right : r.bottom;
      const near = axis === "x" ? r.left : r.top;
      if (far > viewport + 1 || near < -1) {
        candidates.push({ el, overflow: Math.max(far - viewport, -near) });
      }
    });

    const real = candidates.filter(({ el }) => !clippedByAncestor(el, axis, viewport));

    const set = new Set(real.map((c) => c.el));
    const leaves = real.filter(({ el }) => {
      const it = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = it.nextNode())) {
        if (n !== el && set.has(n)) return false;
      }
      return true;
    });

    return leaves.map((c) => ({ ...c, axis }));
  }

  NS.scan = function (axes) {
    const all = [];
    for (const a of axes) all.push(...scanAxis(a));
    all.sort((x, y) => y.overflow - x.overflow);

    NS.lastResults = all.map((c, i) => ({ ...c, index: i }));

    const docEl = document.documentElement;
    return {
      viewport: { width: docEl.clientWidth, height: docEl.clientHeight },
      culprits: NS.lastResults.map((c) => {
        const r = c.el.getBoundingClientRect();
        return {
          index: c.index,
          axis: c.axis,
          overflowPx: Math.round(c.overflow),
          selector: buildSelector(c.el),
          tagName: c.el.tagName.toLowerCase(),
          id: c.el.id || null,
          classes: c.el.classList ? Array.from(c.el.classList).slice(0, 5) : [],
          rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
          reason: diagnose(c.el, c.axis),
        };
      }),
    };
  };
})();
