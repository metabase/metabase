/** Minimum plot dimensions in pixels, excluding card chrome and axis padding. */
export const PLOT_WIDTH_BREAKPOINTS = {
  medium: 300,
  large: 900,
} as const;

export const PLOT_HEIGHT_BREAKPOINTS = {
  small: 200,
  medium: 300,
  large: 400,
} as const;

export const LARGE_CARTESIAN_CARD_MIN_WIDTH = 640;
export const LARGE_CARTESIAN_CARD_MIN_HEIGHT = 360;
