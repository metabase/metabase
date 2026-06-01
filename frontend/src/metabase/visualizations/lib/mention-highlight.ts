// Shared "appearance" animation for data-point mention highlights.
//
// When Metabot highlights a data point (via a mention click), the highlight
// should feel like it lands on the element: it starts slightly larger than the
// element and contracts onto it over ~400ms. This module centralizes the timing
// and the implementation for DOM/SVG-backed highlights (maps, row chart, table)
// via the Web Animations API. ECharts-backed charts implement the same feel
// natively via their graphic/animation APIs but reuse the timing constant.

export const MENTION_HIGHLIGHT_CONTRACT_DURATION = 400;

// Slightly easeOutBack-ish so it overshoots a touch then settles onto the element.
export const MENTION_HIGHLIGHT_CONTRACT_EASING =
  "cubic-bezier(0.22, 1, 0.36, 1)";

// How much bigger than the element the highlight starts before contracting.
const DEFAULT_START_SCALE = 1.5;

/**
 * Animate `element` so it appears to contract onto its resting size: it starts
 * scaled up (and transparent) and settles to its normal size. Works for both
 * HTML and SVG elements. No-op when the Web Animations API is unavailable.
 */
export function animateMentionHighlightContract(
  element: Element,
  { startScale = DEFAULT_START_SCALE }: { startScale?: number } = {},
): Animation | undefined {
  if (typeof element.animate !== "function") {
    return undefined;
  }

  const style = (element as HTMLElement | SVGElement).style;
  // SVG elements need `fill-box` for `transform-origin: center` to scale around
  // their own geometry rather than the SVG viewport origin.
  if (element instanceof SVGElement) {
    style.transformBox = "fill-box";
  }
  style.transformOrigin = "center";

  return element.animate(
    [
      { transform: `scale(${startScale})`, opacity: 0, offset: 0 },
      { transform: "scale(1)", opacity: 1, offset: 1 },
    ],
    {
      duration: MENTION_HIGHLIGHT_CONTRACT_DURATION,
      easing: MENTION_HIGHLIGHT_CONTRACT_EASING,
      fill: "both",
    },
  );
}

/**
 * Animate a brand-colored ring around `element` that starts spread out around it
 * and contracts onto its edge before vanishing. Useful for elements where
 * scaling would distort surrounding layout (e.g. table cells). No-op when the
 * Web Animations API is unavailable.
 */
export function animateMentionHighlightRing(
  element: Element,
  { startSpread = 6 }: { startSpread?: number } = {},
): Animation | undefined {
  if (typeof element.animate !== "function") {
    return undefined;
  }

  return element.animate(
    [
      { boxShadow: `0 0 0 ${startSpread}px var(--mb-color-brand)`, offset: 0 },
      { boxShadow: "0 0 0 0px var(--mb-color-brand)", offset: 1 },
    ],
    {
      duration: MENTION_HIGHLIGHT_CONTRACT_DURATION,
      easing: MENTION_HIGHLIGHT_CONTRACT_EASING,
    },
  );
}

/**
 * Animate an SVG element's highlight stroke so it starts thick and contracts to
 * its resting width — the border appears to tighten onto the shape without
 * moving its geometry. Useful for SVG shapes (row chart bars, choropleth
 * regions). No-op when the Web Animations API is unavailable.
 */
export function animateMentionHighlightStroke(
  element: Element,
  restStrokeWidth: number,
  { startMultiplier = 3 }: { startMultiplier?: number } = {},
): Animation | undefined {
  if (typeof element.animate !== "function") {
    return undefined;
  }

  return element.animate(
    [
      { strokeWidth: `${restStrokeWidth * startMultiplier}px`, offset: 0 },
      { strokeWidth: `${restStrokeWidth}px`, offset: 1 },
    ],
    {
      duration: MENTION_HIGHLIGHT_CONTRACT_DURATION,
      easing: MENTION_HIGHLIGHT_CONTRACT_EASING,
    },
  );
}
