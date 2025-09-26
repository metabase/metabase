/* eslint-disable no-color-literals */
// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCHRONIZED WITH:
// frontend/src/metabase/css/core/colors.module.css
// frontend/src/metabase/styled-components/containers/GlobalStyles/GlobalStyles.tsx
// frontend/src/metabase/styled-components/theme/css-variables.ts
// NOTE: this file is used in the embedding SDK, so it should not contain anything else except the `colors` constant.

const whitelabelColors = window.MetabaseBootstrap?.["application-colors"] ?? {};
const baseBrand = whitelabelColors.brand || "hsla(208, 72%, 60%, 1.00)"; // default Metabase brand color

// Do not export this or you will be fired
const baseColors = {
  white: "hsla(0, 0%, 100%, 1.00)",

  // Brand colors (dynamic based on --mb-color-brand)
  brand: {
    70: `color-mix(in srgb, ${baseBrand}, black 50%)`,
    60: `color-mix(in srgb, ${baseBrand}, black 25%)`,
    40: baseBrand, // This is the base brand color
    30: `color-mix(in srgb, ${baseBrand}, white 45%)`,
    20: `color-mix(in srgb, ${baseBrand}, white 70%)`,
    10: `color-mix(in srgb, ${baseBrand}, white 90%)`,
  },

  // Deprecated Blue
  blue: {
    100: "hsla(208, 100%, 8%, 1.00)",
    90: "hsla(208, 89%, 14%, 1.00)",
    80: "hsla(208, 82%, 22%, 1.00)",
    70: "hsla(208, 80%, 31%, 1.00)",
    60: "hsla(208, 78%, 42%, 1.00)",
    50: "hsla(208, 68%, 53%, 1.00)",
    40: "hsla(208, 72%, 60%, 1.00)", // brand
    30: "hsla(208, 73%, 74%, 1.00)",
    20: "hsla(209, 73%, 88%, 1.00)", // focus
    10: "hsla(208, 79%, 96%, 1.00)", // baby blue
    5: "hsla(210, 75%, 98%, 1.00)",
  },

  // Deprecated Gray
  gray: {
    100: "hsla(206, 16%, 8%, 1.00)", // bg-black
    90: "hsla(202, 15%, 15%, 1.00)",
    80: "hsla(205, 15%, 23%, 1.00)",
    70: "hsla(206, 14%, 32%, 1.00)",
    60: "hsla(207, 9%, 44%, 1.00)",
    50: "hsla(208, 7%, 54%, 1.00)",
    40: "hsla(208, 7%, 60%, 1.00)",
    30: "hsla(208, 11%, 74%, 1.00)",
    20: "hsla(210, 13%, 88%, 1.00)",
    10: "hsla(210, 20%, 96%, 1.00)",
    5: "hsla(210, 25%, 98%, 1.00)",
  },

  // Orion
  orion: {
    100: "hsla(204, 66%, 8%, 1)",
    90: "hsla(204, 34%, 14%, 1)",
    80: "hsla(205, 19%, 23%, 1)",
    70: "hsla(204, 12%, 32%, 1)",
    60: "hsla(205, 8%, 43%, 1)",
    50: "hsla(203, 5%, 53%, 1)",
    40: "hsla(205, 6%, 60%, 1)",
    30: "hsla(203, 6%, 73%, 1)",
    20: "hsla(195, 6%, 87%, 1)",
    10: "hsla(240, 4%, 95%, 1)",
    5: "hsla(240, 11%, 98%, 1)",
  },

  // Orion Alpha
  orionAlpha: {
    100: "hsla(205, 68%, 8%, 1)",
    90: "hsla(204, 66%, 8%, 0.93)",
    80: "hsla(204, 66%, 8%, 0.84)",
    70: "hsla(204, 66%, 8%, 0.74)",
    60: "hsla(204, 66%, 8%, 0.62)",
    50: "hsla(204, 66%, 8%, 0.51)",
    40: "hsla(204, 66%, 8%, 0.44)",
    30: "hsla(204, 66%, 8%, 0.29)",
    20: "hsla(204, 66%, 8%, 0.14)",
    10: "hsla(204, 66%, 8%, 0.05)",
    5: "hsla(204, 66%, 8%, 0.02)",
  },

  orionAlphaInverse: {
    100: "hsla(0, 0%, 100%, 1.00)",
    90: "hsla(0, 0%, 100%, 0.98)",
    80: "hsla(0, 0%, 100%, 0.95)",
    70: "hsla(0, 0%, 100%, 0.85)",
    60: "hsla(0, 0%, 100%, 0.69)",
    50: "hsla(0, 0%, 100%, 0.53)",
    40: "hsla(0, 0%, 100%, 0.46)",
    30: "hsla(0, 0%, 100%, 0.33)",
    20: "hsla(0, 0%, 100%, 0.21)",
    10: "hsla(0, 0%, 100%, 0.10)",
    5: "hsla(0, 0%, 100%, .01)",
  },

  // Lobster
  lobster: {
    100: "hsla(0, 81%, 11%, 1)",
    90: "hsla(1, 75%, 17%, 1)",
    80: "hsla(1, 71%, 26%, 1)",
    70: "hsla(1, 69%, 37%, 1)",
    60: "hsla(1, 67%, 49%, 1)",
    50: "hsla(358, 71%, 62%, 1)",
    40: "hsla(1, 84%, 69%, 1)",
    30: "hsla(1, 85%, 81%, 1)",
    20: "hsla(2, 67%, 90%, 1)",
    10: "hsla(0, 76%, 97%, 1)",
    5: "hsla(0, 100%, 99%, 1)",
  },

  // Flamingo
  flamingo: {
    100: "hsla(334, 75%, 10%, 1)",
    90: "hsla(334, 79%, 17%, 1)",
    80: "hsla(334, 72%, 26%, 1)",
    70: "hsla(334, 71%, 36%, 1)",
    60: "hsla(334, 69%, 48%, 1)",
    50: "hsla(334, 67%, 60%, 1)",
    40: "hsla(334, 80%, 68%, 1)",
    30: "hsla(334, 79%, 80%, 1)",
    20: "hsla(335, 79%, 91%, 1)",
    10: "hsla(335, 67%, 96%, 1)",
    5: "hsla(330, 67%, 99%, 1)",
  },

  // Mango
  mango: {
    100: "hsla(26, 89%, 7%, 1)",
    90: "hsla(26, 79%, 13%, 1)",
    80: "hsla(25, 73%, 20%, 1)",
    70: "hsla(26, 70%, 29%, 1)",
    60: "hsla(26, 69%, 39%, 1)",
    50: "hsla(26, 68%, 48%, 1)",
    40: "hsla(26, 79%, 54%, 1)",
    30: "hsla(26, 84%, 70%, 1)",
    20: "hsla(26, 88%, 87%, 1)",
    10: "hsla(25, 100%, 95%, 1)",
    5: "hsla(30, 100%, 98%, 1)",
  },

  // Dubloon
  dubloon: {
    100: "hsla(45, 100%,  5%, 1)",
    90: "hsla(46, 88%,  10%, 1)",
    80: "hsla(46, 82%,  15%, 1)",
    70: "hsla(46, 79%,  22%, 1)",
    60: "hsla(46, 76%,  30%, 1)",
    50: "hsla(46, 76%,  37%, 1)",
    40: "hsla(46, 75%,  44%, 1)",
    30: "hsla(46, 81%,  52%, 1)",
    20: "hsla(46, 94%,  74%, 1)",
    10: "hsla(46, 96%,  90%, 1)",
    5: "hsla(45, 100%, 96%, 1)",
  },

  // Palm
  palm: {
    100: "hsla(94, 85%, 5%, 1)",
    90: "hsla(92, 62%, 10%, 1)",
    80: "hsla(89, 54%, 16%, 1)",
    70: "hsla(89, 50%, 24%, 1)",
    60: "hsla(89, 48%, 32%, 1)",
    50: "hsla(89, 48%, 40%, 1)",
    40: "hsla(89, 47%, 45%, 1)",
    30: "hsla(90, 47%, 60%, 1)",
    20: "hsla(91, 51%, 81%, 1)",
    10: "hsla(92, 65%, 92%, 1)",
    5: "hsla(93, 73%, 97%, 1)",
  },

  // Seafoam
  seafoam: {
    100: "hsla(180, 84%, 5%, 1)",
    90: "hsla(180, 34%, 12%, 1)",
    80: "hsla(180, 80%, 14%, 1)",
    70: "hsla(180, 70%, 21%, 1)",
    60: "hsla(180, 44%, 33%, 1)",
    50: "hsla(180, 74%, 34%, 1)",
    40: "hsla(180, 42%, 46%, 1)",
    30: "hsla(180, 47%, 60%, 1)",
    20: "hsla(180, 55%, 81%, 1)",
    10: "hsla(180, 68%, 93%, 1)",
    5: "hsla(180, 69%, 97%, 1)",
  },

  // Octopus
  octopus: {
    100: "hsla(240, 7%, 9%, 1)",
    90: "hsla(240, 7%, 9%, 1)",
    80: "hsla(240, 43%, 33%, 1)",
    70: "hsla(240, 40%, 46%, 1)",
    60: "hsla(240, 46%, 58%, 1)",
    50: "hsla(240, 65%, 69%, 1)",
    40: "hsla(240, 69%, 74%, 1)",
    30: "hsla(240, 49%, 81%, 1)",
    20: "hsla(240, 66%, 92%, 1)",
    10: "hsla(240, 100%, 97%, 1)",
    5: "hsla(240, 100%, 99%, 1)",
  },
};

export const colorConfig = {
  "accent-gray-dark": {
    light: baseColors.orion[20],
    dark: baseColors.orion[20],
  },
  "accent-gray-light": {
    light: baseColors.orion[5],
    dark: "#2C2E33",
  },
  "accent-gray": { light: baseColors.orion[10], dark: "#373A40" },
  "admin-navbar": {
    light: baseColors.octopus[60],
    dark: baseColors.octopus[60],
  },
  "background-brand": {
    light: baseColors.brand[40],
    dark: baseColors.brand[40],
  },
  "background-disabled": {
    light: baseColors.orion[10],
    dark: "#2C2E33",
  },
  "background-error-secondary": {
    light: baseColors.lobster[5],
    dark: baseColors.lobster[5],
  },
  "background-hover": {
    light: baseColors.brand[10],
    dark: "#373A40",
  },
  "background-info": { light: baseColors.orion[5], dark: baseColors.orion[5] },
  "background-inverse": {
    light: baseColors.orion[80],
    dark: baseColors.orion[80],
  },
  "background-light": { light: baseColors.orion[5], dark: "#25262B" },
  "background-selected": {
    light: baseColors.brand[40],
    dark: baseColors.brand[40],
  },
  background: { light: baseColors.white, dark: "#1A1B1E" },
  "bg-black-alpha-60": {
    light: `color-mix(in srgb, ${baseColors.orion[80]} 60%, transparent)`,
    dark: `color-mix(in srgb, ${baseColors.orion[80]} 60%, transparent)`,
  },
  "bg-black": { light: baseColors.orion[80], dark: "#1A1B1E" },
  "bg-dark": { light: baseColors.orion[40], dark: "#373A40" },
  "bg-darker": { light: baseColors.orion[70], dark: baseColors.orion[70] },
  "bg-error": { light: baseColors.lobster[10], dark: baseColors.lobster[10] },
  "bg-light": { light: baseColors.orion[5], dark: "#25262B" },
  "bg-medium": { light: baseColors.orion[10], dark: "#2C2E33" },
  "bg-night": { light: baseColors.orion[70], dark: baseColors.orion[70] },
  "bg-white-alpha-15": {
    light: `color-mix(in srgb, ${baseColors.white} 15%, transparent)`,
    dark: `color-mix(in srgb, ${baseColors.white} 15%, transparent)`,
  },
  "bg-white": {
    light: baseColors.white,
    dark: "#1A1B1E", // TODO: Use base color
  },
  "bg-yellow": {
    light: baseColors.dubloon[5],
    dark: baseColors.dubloon[5],
  },
  "border-alpha-30": {
    light: "color-mix(in srgb, #eeecec 30%, transparent)",
    dark: "color-mix(in srgb, #eeecec 30%, transparent)",
  },
  "border-dark": {
    light: baseColors.orion[60],
    dark: baseColors.orion[60],
  },
  border: {
    light: baseColors.orion[20],
    dark: "#373A40",
  },
  "brand-alpha-04": {
    light: `color-mix(in srgb, ${baseColors.blue[40]} 4%, transparent)`,
    dark: `color-mix(in srgb, ${baseColors.blue[40]} 4%, transparent)`,
  },
  "brand-alpha-88": {
    light: `color-mix(in srgb, ${baseColors.blue[40]} 88%, transparent)`,
    dark: `color-mix(in srgb, ${baseColors.blue[40]} 88%, transparent)`,
  },
  "brand-dark": {
    light: baseColors.brand[60],
    dark: baseColors.brand[60],
  },
  "brand-darker": {
    light: baseColors.brand[70],
    dark: baseColors.brand[70],
  },
  "brand-light": {
    light: `color-mix(in srgb, ${baseColors.blue[40]}, #fff 80%)`,
    dark: "#1A3A52",
  },
  "brand-lighter": {
    light: `color-mix(in srgb, ${baseColors.blue[40]}, #fff 90%)`,
    dark: "#0F2A3C",
  },
  brand: {
    light: baseBrand,
    dark: baseBrand,
  },
  danger: {
    light: baseColors.lobster[50],
    dark: "#FF6B6B",
  },
  error: {
    light: baseColors.lobster[50],
    dark: "#FF6B6B",
  },
  filter: {
    light: baseColors.octopus[50],
    dark: "#9775FA",
  },
  focus: {
    light: baseColors.blue[20],
    dark: "#1A3A52",
  },
  "icon-primary-disabled": {
    light: baseColors.orion[30],
    dark: baseColors.orion[30],
  },
  "icon-primary": {
    light: baseColors.brand[40],
    dark: baseColors.brand[40],
  },
  "icon-secondary-disabled": {
    light: baseColors.orion[10],
    dark: baseColors.orion[10],
  },
  "icon-secondary": {
    light: baseColors.brand[20],
    dark: baseColors.brand[20],
  },
  "metabase-brand": {
    light: baseColors.blue[40], // not for whitelabeling
    dark: baseColors.blue[40], // not for whitelabeling
  },
  "saturated-blue": {
    light: "hsla(208, 66%, 50%, 1.00)",
    dark: "hsla(208, 66%, 50%, 1.00)",
  },
  "saturated-green": {
    light: "hsla(90, 48%, 44%, 1.00)",
    dark: "hsla(90, 48%, 44%, 1.00)",
  },
  "saturated-purple": {
    light: "hsla(272, 36%, 52%, 1.00)",
    dark: "hsla(272, 36%, 52%, 1.00)",
  },
  "saturated-red": {
    light: "hsla(0, 78%, 68%, 1.00)",
    dark: "hsla(0, 78%, 68%, 1.00)",
  },
  "saturated-yellow": {
    light: "hsla(46, 94%, 63%, 1.00)",
    dark: "hsla(46, 94%, 63%, 1.00)",
  },
  "shadow-embedding-hub-card": {
    light: "hsla(208, 55%, 77%, 0.70)",
    dark: "hsla(208, 55%, 77%, 0.70)",
  },
  shadow: {
    light: "hsla(0, 0%, 0%, 0.13)",
    dark: "rgba(0, 0, 0, 0.25)",
  },
  "success-darker": {
    light: baseColors.palm[60],
    dark: baseColors.palm[60],
  },
  success: {
    light: baseColors.palm[50],
    dark: "#51CF66",
  },
  summarize: {
    light: baseColors.palm[40],
    dark: "#69DB7C",
  },
  "switch-off": {
    light: baseColors.orion[10],
    dark: baseColors.orion[10],
  },
  "syntax-parameters-active": {
    light: baseColors.mango[10],
    dark: baseColors.mango[10],
  },
  "syntax-parameters": {
    light: baseColors.mango[40],
    dark: baseColors.mango[40],
  },
  "text-brand": {
    light: baseColors.brand[40],
    dark: baseColors.brand[40],
  },
  "text-dark": {
    /* @deprecated, use text-primary */ light: baseColors.orion[80],
    dark: "#C1C2C5",
  },
  "text-disabled": {
    light: baseColors.orion[50],
    dark: baseColors.orion[50],
  },
  "text-hover": {
    light: baseColors.brand[40],
    dark: baseColors.brand[40],
  },
  "text-light": {
    light: baseColors.orion[40],
    dark: "#909296",
  },
  "text-medium": {
    light: baseColors.orion[60],
    dark: "#A6A7AB",
  },
  "text-primary": {
    light: baseColors.orion[80],
    dark: "#C1C2C5",
  },
  "text-secondary-inverse": {
    light: baseColors.orion[30],
    dark: "#6C6E73",
  },
  "text-secondary": {
    light: baseColors.orion[60],
    dark: "#A6A7AB",
  },
  "text-selected": {
    light: baseColors.white,
    dark: baseColors.white,
  },
  "text-tertiary": {
    light: baseColors.orion[40],
    dark: "#909296",
  },
  "text-white-alpha-85": {
    light: `color-mix(in srgb, ${baseColors.white} 85%, transparent)`,
    dark: `color-mix(in srgb, ${baseColors.white} 85%, transparent)`,
  },
  "text-white": {
    light: baseColors.white,
    dark: "#1A1B1E",
  },
  "tooltip-background-focused": {
    light: `color-mix(in srgb, ${baseColors.orion[80]} 50%, #000)`,
    dark: `color-mix(in srgb, ${baseColors.orion[80]} 50%, #000)`,
  },
  "tooltip-background": {
    light: baseColors.orion[80], // references mb-color-background-inverse
    dark: baseColors.orion[80], // references mb-color-background-inverse
  },
  "tooltip-text-secondary": {
    light: baseColors.orion[40], // references mb-color-text-light
    dark: baseColors.orion[40], // references mb-color-text-light
  },
  "tooltip-text": {
    light: baseColors.white,
    dark: baseColors.white,
  },
  warning: {
    light: baseColors.dubloon[30],
    dark: "#FFD43B",
  },

  white: {
    light: baseColors.white,
    dark: "#1A1B1E",
  },
  // Legacy colors (keeping existing ones for backward compatibility)
  accent0: {
    light: "#509EE3",
    dark: "#509EE3",
  },
  accent1: {
    light: "#88BF4D",
    dark: "#88BF4D",
  },
  accent2: {
    light: "#A989C5",
    dark: "#A989C5",
  },
  accent3: {
    light: "#EF8C8C",
    dark: "#EF8C8C",
  },
  accent4: {
    light: "#F9D45C",
    dark: "#F9D45C",
  },
  accent5: {
    light: "#F2A86F",
    dark: "#F2A86F",
  },
  accent6: {
    light: "#98D9D9",
    dark: "#98D9D9",
  },
  accent7: {
    light: "#7172AD",
    dark: "#7172AD",
  },
  // ...whitelabelColors, // TODO: Figure out where/how to define this

  // TODO: These were newly added in `dark-mode` branch. Fold these in above, and replace their hardcoded values with variables.
  "bg-primary": {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  "bg-secondary": {
    light: "#F9FBFC",
    dark: "#25262B",
  },
  "bg-tertiary": {
    light: "#EDF2F5",
    dark: "#2C2E33",
  },
  "bg-hover": {
    light: "#F9FBFC",
    dark: "#373A40",
  },
  overlay: {
    light: "hsla(225, 7.1%, 11%, 40%)",
    dark: "hsla(225, 7.1%, 31%, 40%)",
  },
  "text-inverse": {
    light: "#FFFFFF",
    dark: "#1A1B1E",
  },
  "border-primary": {
    light: "#EEECEC",
    dark: "#373A40",
  },
  "border-secondary": {
    light: "#DCDFE0",
    dark: "#2C2E33",
  },
};

// TODO: Use theme-aware colors instead of this export
export const colors: Record<keyof typeof colorConfig, string> = {
  ...Object.fromEntries(
    Object.entries(colorConfig).map(([k, v]) => [k, v.light]),
  ),
  ...whitelabelColors, // TODO: Figure out where/how to define this
};
