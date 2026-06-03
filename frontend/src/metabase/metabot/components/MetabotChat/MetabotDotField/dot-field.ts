/*
 * Dot-field rendering engine for the Metabot "thinking → content reveal"
 * animation. Framework-agnostic: a single drawDotField() paints a fixed
 * lattice of faint brand dots to a canvas, with per-dot alpha driven by a
 * vertical profile (relative to the thinking row) and a random staggered
 * fade-out. The lattice positions never move — only alpha changes — so the
 * grid can never be "disturbed", and the thinking block's dots always land on
 * it as long as its rest positions are multiples of the pitch.
 *
 * Ported from the validated standalone prototype.
 */

/** Lattice pitch in CSS px. The whole grid (and the M loader) is built on this. */
export const DOT_PITCH = 10;

/** Peak opacity of a faint field dot. */
export const DOT_BASE_ALPHA = 0.26;

/*
 * Random fade-out spread. Each dot starts vanishing somewhere in the first
 * FADE_START_SPREAD of the fade window (keyed off its stable noise), then fades
 * individually over FADE_DOT_DURATION. With a ~2.5s window this means some dots
 * are gone in ~100ms while others linger ~2s — a very noticeable dissolve.
 */
const FADE_START_SPREAD = 0.82;
const FADE_DOT_DURATION = 0.05;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const smoothstep = (x: number): number => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

// ---- easings ----
export const easeOutCubic = (x: number): number =>
  1 - Math.pow(1 - clamp01(x), 3);

export const easeInOutCubic = (x: number): number => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutBack = (x: number): number => {
  x = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export const easeInOutSine = (x: number): number =>
  -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;

/** Normalized progress of clock `tc` through a [start, end] segment. */
export const segmentProgress = (
  tc: number,
  [start, end]: readonly [number, number],
): number => (end > start ? (tc - start) / (end - start) : 0);

/** Seeded PRNG (mulberry32) so per-dot "randomness" is stable across frames/seeks. */
const mulberry32 = (seed: number): (() => number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
};

/** Build a stable per-dot noise field for a `cols × rows` lattice. */
export const makeDotNoise = (
  cols: number,
  rows: number,
  seed = 1234,
): Float32Array => {
  const noise = new Float32Array(Math.max(0, cols * rows));
  const rnd = mulberry32(seed);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = rnd();
  }
  return noise;
};

/*
 * Vertical visibility profile relative to the thinking row's y:
 *  - above the row  → solid (this is the content field)
 *  - below the row  → fades out over ~7 rows (the "thinking band")
 *
 * No soft top edge: per-block fields stack, so a faded top would leave a faint
 * band at every block boundary. The fields bleed into each other instead, so
 * the lattice reads as one continuous grid.
 */
const profileV = (y: number, thinkingY: number, pitch: number): number => {
  const d = y - thinkingY;
  return d <= 0 ? 1 : 1 - smoothstep(d / (7 * pitch));
};

/*
 * How "protected" a dot is from the random fade-out (1 = keep forever). Dots
 * within ~2 rows above the thinking row and the whole band below it are kept,
 * so the thinking block always retains its dot halo while generating.
 */
const keepFactor = (y: number, thinkingY: number, pitch: number): number => {
  const d = y - thinkingY;
  return smoothstep((d + 4 * pitch) / (2 * pitch));
};

/** One frame of dot-field state, produced by the reveal timeline. */
export interface DotFieldFrame {
  /** Y (CSS px, canvas-local) of the thinking row the profile is anchored to. */
  thinkingY: number;
  /** 0..1 random staggered fade-out of the content-area dots. */
  fadeProgress: number;
  /** 0..1 — dissolve the thinking band too (used when the turn finishes). */
  thinkingFade?: number;
  /** Lattice phase offset so stacked canvases share one continuous grid. */
  originY?: number;
}

export interface DrawDotFieldOptions {
  /** Canvas width in CSS px. */
  width: number;
  /** Canvas height in CSS px. */
  height: number;
  /** Device pixel ratio the canvas backing store is scaled by. */
  dpr: number;
  /** Lattice pitch in CSS px. */
  pitch?: number;
  /** Stable per-dot noise (length must be ceil(width/pitch) * ceil(height/pitch)). */
  noise: Float32Array;
  /** Y (CSS px, canvas-local) of the thinking row the profile is anchored to. */
  thinkingY: number;
  /** 0..1 random staggered fade-out of the content-area dots. */
  fadeProgress: number;
  /** 0..1 — dissolve the thinking band too (used when the turn finishes). */
  thinkingFade?: number;
  /** Fill color (any CSS color string, e.g. the resolved brand color). */
  color: string;
  /** Peak field-dot opacity. */
  baseAlpha?: number;
  /**
   * Phase offset (CSS px) of the lattice origin, so multiple canvases stacked
   * in a scroll container can share one continuous grid. Dot centers sit at
   * `pitch/2 + originY (mod pitch) + row*pitch`.
   */
  originY?: number;
}

/**
 * Paint one frame of the dot field. Dots are bucketed by alpha so each bucket
 * fills in a single path (≈12 fills/frame instead of thousands of arcs).
 */
export const drawDotField = (
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    dpr,
    pitch = DOT_PITCH,
    noise,
    thinkingY,
    fadeProgress,
    thinkingFade = 0,
    color,
    baseAlpha = DOT_BASE_ALPHA,
    originY = 0,
  }: DrawDotFieldOptions,
): void => {
  const cols = Math.ceil(width / pitch);
  const rows = Math.ceil(height / pitch);
  const phase = ((originY % pitch) + pitch) % pitch;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;

  const BUCKETS = 12;
  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);

  for (let row = 0; row < rows; row++) {
    const y = phase + pitch / 2 + row * pitch;
    const pv = profileV(y, thinkingY, pitch);
    if (pv <= 0.002) {
      continue;
    }
    // when finishing, the band loses its protection so it dissolves too
    const keep = keepFactor(y, thinkingY, pitch) * (1 - thinkingFade);
    for (let col = 0; col < cols; col++) {
      const n = noise[row * cols + col] ?? 0;
      // staggered random fade-out: low-noise dots vanish first, with a wide
      // spread of disappearance times across the window
      const fo = smoothstep(
        (fadeProgress - n * FADE_START_SPREAD) / FADE_DOT_DURATION,
      );
      const fadeMul = 1 - (1 - keep) * fo;
      const aNorm = pv * fadeMul;
      if (aNorm <= 0.05) {
        continue;
      }
      const b = Math.min(BUCKETS - 1, (aNorm * BUCKETS) | 0);
      buckets[b].push(pitch / 2 + col * pitch, y);
    }
  }

  for (let b = 0; b < BUCKETS; b++) {
    const arr = buckets[b];
    if (!arr.length) {
      continue;
    }
    ctx.globalAlpha = baseAlpha * ((b + 0.5) / BUCKETS);
    ctx.beginPath();
    for (let k = 0; k < arr.length; k += 2) {
      const x = arr[k];
      const y = arr[k + 1];
      ctx.moveTo(x + 1.15, y);
      ctx.arc(x, y, 1.15, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};
