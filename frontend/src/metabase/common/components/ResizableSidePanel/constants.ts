/**
 * Standard widths for resizable side panels across the app. Panels pick the
 * preset closest to their historical width; `md` is the default. `xl` is
 * reserved for panels that were already wider than the default max width and
 * need a larger resize ceiling (opt in via the `maxSize` prop).
 */
export const SIDE_PANEL_SIZES = {
  sm: 256,
  md: 320,
  lg: 400,
  xl: 480,
} as const;

export type SidePanelSize = keyof typeof SIDE_PANEL_SIZES;

export const DEFAULT_SIDE_PANEL_SIZE: SidePanelSize = "md";

/**
 * Hard limits a user may drag a side panel between. The default ceiling is
 * 384px; panels that need to grow wider opt into a larger `maxSize` preset.
 */
export const SIDE_PANEL_MIN_WIDTH = 224;
export const SIDE_PANEL_MAX_WIDTH = 384;
