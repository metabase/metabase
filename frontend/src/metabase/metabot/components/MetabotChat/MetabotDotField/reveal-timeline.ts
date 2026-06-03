/*
 * Choreography for the "thinking → content reveal" sequence. Pure functions of
 * a clock `tc` (ms), so it is identical whether driven by a rAF clock (live) or
 * a seek (testing). Geometry (reserved height, idle offset) is supplied by the
 * caller, since the real app measures it from the DOM.
 */

import {
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  segmentProgress,
} from "./dot-field";

export type RevealContentKind = "chart" | "text";

export interface RevealTimeline {
  /** thinking block slides down, dots fill the opened space */
  reserve: readonly [number, number];
  /** chart line/bars draw (native ECharts in the app; synthetic in the story) */
  draw: readonly [number, number];
  /** text + chrome fade IN — fast, lands early */
  reveal: readonly [number, number];
  /** dots fade OUT — starts with the reveal, finishes later (gentle dissolve) */
  dotsFade: readonly [number, number];
  duration: number;
}

export const REVEAL_TIMELINES: Record<RevealContentKind, RevealTimeline> = {
  chart: {
    reserve: [0, 340],
    draw: [430, 1110],
    reveal: [1010, 1310],
    // dots dissolve over ~2.5s with a wide random spread (see dot-field FADE_*)
    dotsFade: [1010, 3510],
    duration: 3560,
  },
  text: {
    reserve: [0, 300],
    draw: [0, 0],
    reveal: [400, 680],
    dotsFade: [400, 2900],
    duration: 2950,
  },
};

export interface RevealFrame {
  /** eased reserve progress (drives the thinking-block slide) */
  reserveProgress: number;
  /** eased draw progress (drives the synthetic chart in the story) */
  drawProgress: number;
  /** raw draw progress (uneased) for marker/bar scheduling */
  drawRaw: number;
  /** text/chrome opacity — fast in */
  revealProgress: number;
  /** dots fade-out — slow out */
  fadeProgress: number;
  /** whether the content column should be mounted/visible at all */
  contentVisible: boolean;
}

export const computeRevealFrame = (
  tc: number,
  tl: RevealTimeline,
): RevealFrame => {
  const reserveProgress = easeInOutCubic(segmentProgress(tc, tl.reserve));
  const drawRaw =
    tl.draw[1] > tl.draw[0] ? clamp01(segmentProgress(tc, tl.draw)) : 0;
  const drawProgress = easeOutCubic(drawRaw);
  const revealRaw = segmentProgress(tc, tl.reveal);
  const revealProgress = easeOutCubic(revealRaw);
  const fadeProgress = clamp01(segmentProgress(tc, tl.dotsFade));
  return {
    reserveProgress,
    drawProgress,
    drawRaw,
    revealProgress,
    fadeProgress,
    contentVisible: drawRaw > 0 || revealRaw > 0,
  };
};
