// Reusable demo-cursor overlay for Playwright video recordings.
//
// Playwright's `recordVideo` captures the page's rendered pixels — the OS
// cursor is NOT included. For demo videos the audience needs to see a
// cursor, so this module injects a synthetic one into the page via
// `addInitScript`, animates it via the same `page.mouse.move()` events the
// driver already uses, and provides helpers (`demoClick`, `demoHover`,
// `pan`, `glideTo`) that wrap actions with action labels and arc previews
// for legibility.
//
// USAGE — minimum:
//
//   import { installCursor, attachCursorHelpers } from "./cursor-overlay.mjs";
//
//   const context = await browser.newContext({ recordVideo: {...} });
//   await installCursor(context);                       // inject cursor + caption + arc
//   const page = await context.newPage();
//   const { initPosition, demoClick, demoHover, pan } = attachCursorHelpers(page);
//
//   await page.goto(URL);
//   await page.waitForLoadState("networkidle");
//   await initPosition();                               // seed cursor at viewport center
//   await demoClick(page.getByRole("button", { name: "Save" }), { label: "Save" });
//   await demoHover(page.locator("tbody tr").first(),  { label: "Stale card" });
//
// SWAPPING THE ICON:
//
//   await installCursor(context, { icon: ICONS.arrow });            // built-in arrow
//   await installCursor(context, { icon: ICONS.metabase });          // built-in Metabase mark (default)
//   await installCursor(context, { icon: { svg: '<svg ...>', anchorX: 12, anchorY: 12 } });
//
// All built-in icons are mirrored as standalone files under
// `./cursor-icons/` so they can be previewed and customized visually
// before being inlined here.

/** Built-in icon definitions. Each is a single-line SVG with explicit
 *  anchor coords (where the click point sits inside the icon's bounding
 *  box). Keep the SVG single-line so it can be interpolated into the
 *  init-script template without breaking the JS string. */
export const ICONS = {
  /** Metabase brand mark (22-dot logo). Center-anchored. Color is set
   *  via the cursor div's `color` style (the SVG uses `currentColor`),
   *  so passing `color` to `buildCursorScript` rethemes it. */
  metabase: {
    width: 28,
    height: 34,
    anchorX: 14,
    anchorY: 17,
    useCurrentColor: true,
    svg: '<svg width="28" height="34" viewBox="0 0 212 256" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><circle cx="15.55" cy="60.53" r="15.55"/><circle cx="15.55" cy="105.51" r="15.55"/><circle cx="60.53" cy="105.51" r="15.55"/><circle cx="195.47" cy="60.53" r="15.55"/><circle cx="150.49" cy="105.51" r="15.55"/><circle cx="105.51" cy="150.49" r="15.55"/><circle cx="195.47" cy="105.51" r="15.55"/><circle cx="15.55" cy="150.49" r="15.55"/><circle cx="195.47" cy="150.49" r="15.55"/><circle cx="15.55" cy="195.47" r="15.55"/><circle cx="195.47" cy="195.47" r="15.55"/><circle cx="60.53" cy="60.53" r="15.55" opacity="0.2"/><circle cx="105.51" cy="60.53" r="15.55" opacity="0.2"/><circle cx="105.51" cy="15.55" r="15.55" opacity="0.2"/><circle cx="105.51" cy="105.51" r="15.55" opacity="0.2"/><circle cx="150.49" cy="60.53" r="15.55" opacity="0.2"/><circle cx="60.53" cy="150.49" r="15.55" opacity="0.2"/><circle cx="150.49" cy="150.49" r="15.55" opacity="0.2"/><circle cx="60.53" cy="195.47" r="15.55" opacity="0.2"/><circle cx="105.51" cy="195.47" r="15.55" opacity="0.2"/><circle cx="105.51" cy="240.45" r="15.55" opacity="0.2"/><circle cx="150.49" cy="195.47" r="15.55" opacity="0.2"/></svg>',
  },
  /** Classic arrow cursor. Tip-anchored at (3, 2). Fill and stroke are
   *  baked into the SVG, so the `color` arg is ignored for this icon. */
  arrow: {
    width: 24,
    height: 24,
    anchorX: 3,
    anchorY: 2,
    useCurrentColor: false,
    svg: '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L21 13 L13 14 L17 22 L13 23 L9 15 L3 21 Z" fill="rgba(80,158,228,0.95)" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  },
};

/** Produce the init-script string that, when run via
 *  `context.addInitScript`, installs the cursor + caption + ripple + arc
 *  machinery on every page.
 *
 *  Options:
 *    - icon: one of ICONS, or `{ svg, anchorX, anchorY, useCurrentColor? }`
 *    - color: applied as the cursor div's `color` (themes `currentColor`
 *      SVGs). Ignored when icon.useCurrentColor === false.
 */
export function buildCursorScript({
  icon = ICONS.metabase,
  color = "rgba(80,158,228,0.95)",
} = {}) {
  const ICON_SVG = icon.svg;
  const ANCHOR_X = icon.anchorX;
  const ANCHOR_Y = icon.anchorY;
  const COLOR_STYLE = icon.useCurrentColor === false ? "" : `color:${color};`;

  // The script body is single-quoted to keep the outer template literal
  // free of nested-backtick gymnastics. All `\\n` escapes survive into the
  // emitted string verbatim.
  return `
(() => {
  if (window.__cursorInjected) return;
  window.__cursorInjected = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
  function install() {
    const root = document.body || document.documentElement;

    const style = document.createElement('style');
    style.textContent = [
      '@keyframes __rippleFade {',
      '  0% { transform: translate(-16px,-16px) scale(0.4); opacity: 0.75; }',
      '  60% { opacity: 0.25; }',
      '  100% { transform: translate(-16px,-16px) scale(1.8); opacity: 0; }',
      '}',
      '@keyframes __arcFade {',
      '  0% { opacity: 0.75; stroke-dashoffset: 0; }',
      '  100% { opacity: 0; stroke-dashoffset: -24; }',
      '}',
      '@keyframes __captionShow {',
      '  0% { opacity: 0; transform: translate(14px,14px) scale(0.92); }',
      '  12% { opacity: 1; transform: translate(14px,14px) scale(1); }',
      '  88% { opacity: 1; transform: translate(14px,14px) scale(1); }',
      '  100% { opacity: 0; transform: translate(14px,14px) scale(0.92); }',
      '}',
    ].join('\\n');
    root.appendChild(style);

    const cur = document.createElement('div');
    cur.innerHTML = '${ICON_SVG}';
    cur.style.cssText = [
      'position:fixed','left:-100px','top:-100px',
      'margin-left:-${ANCHOR_X}px','margin-top:-${ANCHOR_Y}px',
      '${COLOR_STYLE}',
      'pointer-events:none','z-index:2147483647',
      'transform:scale(1)','transform-origin:center',
      // CSS-interpolated motion between mousemove samples — the browser
      // eases the rendered position over 100ms so the recorder doesn't
      // see discrete steps.
      'transition:transform 80ms ease-out, left 100ms ease-out, top 100ms ease-out',
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
      'will-change:transform, left, top',
    ].join(';');
    root.appendChild(cur);

    const caption = document.createElement('div');
    caption.style.cssText = [
      'position:fixed','left:-200px','top:-200px',
      'padding:4px 10px','border-radius:6px',
      'background:rgba(20,32,48,0.92)','color:white',
      'font:500 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
      'pointer-events:none','z-index:2147483647',
      'white-space:nowrap','opacity:0',
      'box-shadow:0 2px 6px rgba(0,0,0,0.3)',
      'transition:left 100ms ease-out, top 100ms ease-out',
    ].join(';');
    root.appendChild(caption);

    let curX = -100, curY = -100;

    window.addEventListener('mousemove', (e) => {
      curX = e.clientX; curY = e.clientY;
      cur.style.left = curX + 'px';
      cur.style.top = curY + 'px';
      caption.style.left = curX + 'px';
      caption.style.top = curY + 'px';
    }, { passive: true });

    window.addEventListener('mousedown', (e) => {
      cur.style.transform = 'scale(0.85)';
      const ripple = document.createElement('div');
      ripple.style.cssText = [
        'position:fixed','left:' + e.clientX + 'px','top:' + e.clientY + 'px',
        'width:32px','height:32px','border-radius:50%',
        'border:2px solid rgba(80,158,228,0.85)',
        'background:rgba(80,158,228,0.1)',
        'pointer-events:none','z-index:2147483646',
        'animation:__rippleFade 280ms ease-out forwards',
      ].join(';');
      root.appendChild(ripple);
      const dropRipple = () => ripple.remove();
      ripple.addEventListener('animationend', dropRipple, { once: true });
      // Belt-and-suspenders: animationend can be missed under recording.
      setTimeout(dropRipple, 320);
    });
    window.addEventListener('mouseup', () => {
      cur.style.transform = 'scale(1)';
    });

    // Arc preview — one-shot dashed curve from (x1,y1) to (x2,y2). The
    // driver fires this for long moves (>250px by default) so the curve
    // has room to read.
    window.__cursorArc = (x1, y1, x2, y2) => {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('style','position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483644');
      const path = document.createElementNS(NS, 'path');
      const mx = (x1+x2)/2, my = (y1+y2)/2;
      const dx = x2-x1, dy = y2-y1;
      const len = Math.hypot(dx,dy) || 1;
      // Perpendicular control-point offset → gentle arc reads as
      // path-of-intent rather than a ruler line.
      const cx = mx + (-dy/len) * len * 0.15;
      const cy = my + (dx/len)  * len * 0.15;
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' Q ' + cx + ' ' + cy + ' ' + x2 + ' ' + y2);
      path.setAttribute('stroke','rgba(80,158,228,0.75)');
      path.setAttribute('stroke-width','2.5');
      path.setAttribute('stroke-linecap','round');
      path.setAttribute('fill','none');
      path.setAttribute('stroke-dasharray','6 6');
      path.style.animation = '__arcFade 750ms ease-out forwards';
      svg.appendChild(path);
      root.appendChild(svg);
      const dropArc = () => svg.remove();
      svg.addEventListener('animationend', dropArc, { once: true });
      setTimeout(dropArc, 800);
    };

    // Caption: appears at current cursor pos, fades after its TTL.
    let captionTimer = null;
    window.__cursorCaption = (text, ttl) => {
      if (captionTimer) { clearTimeout(captionTimer); captionTimer = null; }
      caption.textContent = text;
      // Seed position from last known mouse coords so the caption doesn't
      // flash at -100,-100 before the next mousemove arrives.
      caption.style.left = curX + 'px';
      caption.style.top = curY + 'px';
      caption.style.animation = 'none';
      void caption.offsetWidth; // reflow to restart the CSS animation
      const dur = Math.max(800, ttl || 1500);
      caption.style.animation = '__captionShow ' + dur + 'ms ease-out forwards';
      captionTimer = setTimeout(() => {
        caption.textContent = '';
        caption.style.animation = 'none';
        caption.style.opacity = '0';
        captionTimer = null;
      }, dur + 50);
    };
  } // install
})();
`;
}

/** Install the cursor on a browser context. Convenience wrapper around
 *  `context.addInitScript(buildCursorScript(opts))` — call once, before
 *  any page navigation. */
export async function installCursor(context, opts = {}) {
  await context.addInitScript(buildCursorScript(opts));
}

/** Attach demo-driver helpers to a page. The helpers wrap Playwright's
 *  bare click/hover with a "glide-to-target, dwell, label, then act"
 *  sequence that's legible to a video audience.
 *
 *  Options (all optional):
 *    - startX, startY: cursor seed position. Default (720, 450).
 *    - arcThreshold: minimum distance (px) to fire the dashed arc preview.
 *      Default 250.
 *    - defaultDwell: ms to pause after the glide, before click. Default 600.
 *    - defaultHoverDwell: ms to stay on a hovered element. Default 1200.
 *    - stepCount: Playwright mouse-move steps per glide. Default 20.
 *    - panStepCount: steps for `pan()` exploratory sweeps. Default 25.
 */
export function attachCursorHelpers(page, opts = {}) {
  const startX = opts.startX ?? 720;
  const startY = opts.startY ?? 450;
  const arcThreshold = opts.arcThreshold ?? 250;
  const defaultDwell = opts.defaultDwell ?? 600;
  const defaultHoverDwell = opts.defaultHoverDwell ?? 1200;
  const stepCount = opts.stepCount ?? 20;
  const panStepCount = opts.panStepCount ?? 25;

  let lastCursor = { x: startX, y: startY };
  const pause = (ms) => page.waitForTimeout(ms);

  // Seed Playwright's mouse + the synthetic cursor at viewport center
  // so the first arc preview has a sane origin.
  async function initPosition(x = startX, y = startY) {
    await page.mouse.move(x, y, { steps: 1 });
    lastCursor = { x, y };
  }

  async function pan(x, y) {
    await page.mouse.move(x, y, { steps: panStepCount });
    lastCursor = { x, y };
  }

  async function glideTo(cx, cy, { showArc = true } = {}) {
    const dist = Math.hypot(cx - lastCursor.x, cy - lastCursor.y);
    if (showArc && dist > arcThreshold) {
      await page.evaluate(
        ([x1, y1, x2, y2]) => window.__cursorArc?.(x1, y1, x2, y2),
        [lastCursor.x, lastCursor.y, cx, cy],
      );
    }
    await page.mouse.move(cx, cy, { steps: stepCount });
    lastCursor = { x: cx, y: cy };
  }

  async function targetCenter(locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error("no bounding box for locator");
    return {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
    };
  }

  async function showCaption(label, dwell) {
    if (!label) return;
    await page.evaluate(
      ([t, ms]) => window.__cursorCaption?.(t, ms),
      [label, dwell + 400],
    );
  }

  async function demoClick(locator, { label, dwell = defaultDwell } = {}) {
    const { x, y } = await targetCenter(locator);
    await showCaption(label, dwell);
    await glideTo(x, y);
    await pause(dwell);
    await locator.click();
  }

  async function demoHover(
    locator,
    { label, dwell = defaultHoverDwell } = {},
  ) {
    const { x, y } = await targetCenter(locator);
    await showCaption(label, dwell);
    await glideTo(x, y);
    await locator.hover();
    await pause(dwell);
  }

  return { initPosition, pan, glideTo, demoClick, demoHover };
}
