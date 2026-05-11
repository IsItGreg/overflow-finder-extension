# Chrome Web Store listing copy

Plain-text drafts ready to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). The Web Store does not render Markdown — these are formatted as plain text with section headers in ALL CAPS.

---

## Short description (≤132 chars)

```
Stop deleting nodes to bisect. Find the elements causing page overflow with a DevTools tab that ranks culprits and causes.
```

(122 chars)

---

## Detailed description

```
Overflow Finder adds a DevTools tab that pinpoints which DOM elements are
making your page wider (or taller) than the viewport. Instead of deleting
nodes one by one in the Elements panel to bisect, you click Scan and get a
ranked list of culprits with the likely cause for each.

WHAT IT SHOWS

For every element that overflows the viewport, you see:
- the axis (horizontal or vertical) and the overflow distance in pixels
- the element's tag, id, and class list
- a likely cause guessed from computed style — for example "width: 1400px",
  "white-space: nowrap", "translateX(600px)", a missing max-width on an
  image, "table-layout: auto", or an absolutely-positioned element placed
  off-screen
- the element's bounding-box size

PER-CULPRIT ACTIONS

- Scroll to: smoothly scrolls the page so the element is centered, with a
  red highlight box that tracks it during the scroll.
- Inspect: selects the element in the Elements panel.
- Delete: removes the element from the DOM so you can see the page reflow
  without it. Click again on the same card to restore the element to its
  original position. A toolbar "Restore deleted" link undoes the whole
  batch at once.
- Hovering a result card paints the highlight on the page.

HOW IT WORKS

The panel walks the DOM (descending into open shadow roots), drops anything
safely contained inside an overflow:hidden / auto / scroll / clip ancestor,
and reduces the rest to leaf-most culprits — the elements actually causing
the overflow rather than parents that just inherited it. Element references
stay in the page; only serializable metadata crosses to the panel.

INCLUDED TEST PAGE

A bundled fixture page (linked from the panel toolbar) contains a dozen
planted culprits — wide images, white-space:nowrap pre tags, negative
margins, off-screen absolute positioning, transform translations, wide
tables, and more — so you can verify the install and learn what each cause
looks like.

LIMITATIONS

- Top-level frame only; iframe content is not scanned.
- Scan-on-demand; no live re-scan as the page changes — click Scan again
  after a resize or DOM mutation.
- Chrome / Chromium only.

PRIVACY

Overflow Finder collects no data, sends no telemetry, and makes no network
requests. All scanning happens locally inside your DevTools session.

SOURCE

https://github.com/IsItGreg/overflow-finder-extension
```

---

## Single-purpose statement

```
Overflow Finder is a debugging tool with one purpose: identifying which DOM elements are causing a web page to overflow its viewport horizontally or vertically. It runs only when the user clicks the Scan button in its DevTools panel, analyzes the inspected page's layout via the chrome.devtools.inspectedWindow API, and returns a ranked list of culprit elements with their likely cause from computed style.
```

---

## Permissions justifications

**`web_accessible_resources` (test/fixtures.html):**

```
Used to expose the bundled test page (test/fixtures.html) so the "Test page" link in the panel toolbar can open it in a new tab. The page contains intentional layout-overflow examples and serves as a verification tool for the user to confirm the extension is working correctly. The page is fully self-contained — no remote assets, scripts, trackers, or analytics.
```

**`chrome.devtools.inspectedWindow.eval` (no manifest permission required, but reviewers ask):**

```
Used to execute the extension's bundled scan and overlay scripts (inject/scan.js, inject/overlay.js) inside the page being debugged, so the extension can measure element bounding boxes and computed styles. The scripts are bundled with the extension and never load remote code. Eval runs only in response to direct user actions: clicking Scan, hovering a result row, or clicking the per-row Scroll-to / Inspect buttons.
```

---

## Data usage form answers

- **Does the extension collect or use personal or sensitive user data?** No
- **Does the extension share data with third parties?** No
- **Does the extension use data for purposes unrelated to its single purpose?** No
- **Does the extension determine credit-worthiness or facilitate lending decisions?** No
- **Is remote code being used?** No — all code is bundled within the package.

---

## Privacy policy

If the dashboard requires a URL, link to the Privacy section of the README:

```
https://github.com/IsItGreg/overflow-finder-extension#privacy
```

---

## Submission settings

- **Category:** Developer Tools
- **Visibility:** Public
- **Pricing:** Free
- **Language:** English

---

## Listing assets

All in [`store-assets/`](store-assets/):

| File | Dimensions | Aspect | CWS field |
| --- | --- | --- | --- |
| `store-assets/screenshot-1.png` | 1280×800 | 1.60 | **Screenshot** — already sized to CWS spec. |
| `store-assets/promo-tile.png` | 1586×992 | 1.60 | **Small promo tile** (target 440×280, aspect 1.57 — CWS will downscale). |
| `store-assets/marquee.png` | 1983×793 | 2.50 | **Marquee promo tile** (target 1400×560, aspect 2.50 — exact match). |
| `store-assets/icon-source.png` | 1254×1254 | 1.00 | Source for the `icons/icon-*.png` files. Keep for re-rendering future variants. |

CWS will accept the originals and downscale them. If you need exact-sized uploads, run:

```bash
sips -z 280 440 store-assets/promo-tile.png --out promo-tile-440x280.png
sips -z 560 1400 store-assets/marquee.png    --out marquee-1400x560.png
```

(`sips -z` takes height then width, in that order.)

## Screenshots checklist

CWS requires at least 1 screenshot at **1280×800** or **640×400** (PNG/JPG). [`store-assets/screenshot-1.png`](store-assets/screenshot-1.png) is pre-sized to 1280×800 and ready to upload. For additional screenshots showing more interactions, capture:

1. **Delete + Restore in action** — capture before/after deleting a culprit so the page reflows.
2. **Hover-highlight on the page** — split-pane showing the red overlay tracking a culprit.
