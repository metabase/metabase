import Color from "color";

/** Container dimensions. The wheel diameter is taken from the smaller of the
 *  two so the wheel always fits, with the remainder distributed as label halo
 *  on every side. */
export const WIDTH = 720;
export const HEIGHT = 720;

export const CENTER_X = WIDTH / 2;
export const CENTER_Y = HEIGHT / 2;

const SHORT_SIDE = Math.min(WIDTH, HEIGHT);

/** Padding between the wheel's outer edge and the container edge (per side).
 *  Sized to accommodate the longest label plus its swatch. */
const LABEL_HALO = 140;

export const RING_OUTER = SHORT_SIDE / 2 - LABEL_HALO;
export const RING_INNER = RING_OUTER - 35;
export const VERTEX_RADIUS = RING_OUTER - 18;

// Swatch radii, in SVG pixels — kept in geometry so labels can position
// themselves to touch each swatch's outer edge.
export const BRAND_SWATCH_RADIUS = 22;
export const SQUARE_SIDE_SWATCH_RADIUS = 18;
export const CHART_SWATCH_RADIUS = 13;
export const ANCHOR_MARKER_RADIUS = 11;

/** Extra space between every label's inner edge and its swatch's outer edge.
 *  Set to 0 to make labels touch their swatches; raise to push every label
 *  further from the wheel center uniformly. */
export const LABEL_PADDING = 10;

/**
 * Maps a hue (0–360°) to an (x, y) point at the given radius around the wheel
 * center. Hue 0 sits at the top, increasing clockwise — matched to the
 * `conic-gradient(from 0deg, …)` that paints the hue ring.
 */
export const polar = (radius: number, hueDeg: number): [number, number] => {
  const rad = ((hueDeg - 90) * Math.PI) / 180;
  return [CENTER_X + radius * Math.cos(rad), CENTER_Y + radius * Math.sin(rad)];
};

export const HUE_GRADIENT_STOPS = Array.from(
  { length: 13 },
  (_, i) => `hsl(${i * 30}, 100%, 50%)`,
).join(", ");

export const isLightColor = (hex: string) => Color(hex).isLight();
