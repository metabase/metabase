/** Minimum plot dimensions in pixels, excluding card chrome and axis padding. */
export const PLOT_HEIGHT_BREAKPOINTS = {
  small: 200,
  medium: 300,
  large: 400,
} as const;

export const CARTESIAN_CHART_BREAKPOINTS = {
  medium: { width: 640, height: 360 },
  large: { width: 900, height: 480 },
} as const;
