// The `--mb-*` variables the provider writes besides `--mb-color-*`. scripts/check-dist.ts
// reads this list to ensure the package never references a variable nobody defines.
export const PROVIDER_CSS_VARIABLES = {
  defaultFontFamily: "--mb-default-font-family",
  defaultMonospaceFontFamily: "--mb-default-monospace-font-family",
  overlayZIndex: "--mb-overlay-z-index",
} as const;

export const COLOR_CSS_VARIABLE_PREFIX = "--mb-color-";
