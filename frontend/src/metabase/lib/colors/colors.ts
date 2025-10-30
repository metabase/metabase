/* eslint-disable no-color-literals */
// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCHRONIZED WITH:
// frontend/src/metabase/css/core/colors.module.css
// frontend/src/metabase/styled-components/containers/GlobalStyles/GlobalStyles.tsx
// frontend/src/metabase/styled-components/theme/css-variables.ts
// NOTE: this file is used in the embedding SDK, so it should not contain anything else except the `colors` constant.

const win = typeof window !== "undefined" ? window : ({} as Window);
const tokenFeatures = win.MetabaseBootstrap?.["token-features"] ?? {};
const shouldWhitelabel = !!tokenFeatures["whitelabel"];
const whitelabelColors =
  (shouldWhitelabel && win.MetabaseBootstrap?.["application-colors"]) || {};

// Do not export this or you will be fired
const baseColors = {
  white: "hsla(0, 0%, 100%, 1.00)",
  black: "hsla(0, 0%, 0%, 1.00)",

  // Brand colors (dynamic based on --mb-color-brand). Expanded to roughly match the values in the new color palette (but these should be reworked).
  brand: {
    100: "color-mix(in srgb, var(--mb-color-brand), black 86%)",
    90: "color-mix(in srgb, var(--mb-color-brand), black 75%)",
    80: "color-mix(in srgb, var(--mb-color-brand), black 62%)",
    70: "color-mix(in srgb, var(--mb-color-brand), black 47%)",
    60: "color-mix(in srgb, var(--mb-color-brand), black 28%)",
    50: "color-mix(in srgb, var(--mb-color-brand), black 12%)",
    40: "var(--mb-color-brand)", // This is the base brand color
    30: "color-mix(in srgb, var(--mb-color-brand), white 35%)",
    20: "color-mix(in srgb, var(--mb-color-brand), white 70%)",
    10: "color-mix(in srgb, var(--mb-color-brand), white 91%)",
    5: "color-mix(in srgb, var(--mb-color-brand), white 96%)",
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

  // Ocean
  ocean: {
    100: "hsla(208, 100%, 9%, 1)",
    90: "hsla(208, 89%, 15%, 1)",
    80: "hsla(208, 82%, 22%, 1)",
    70: "hsla(208, 80%, 31%, 1)",
    60: "hsla(208, 78%, 42%, 1)",
    50: "hsla(208, 68%, 53%, 1)",
    40: "hsla(208, 72%, 60%, 1)",
    30: "hsla(208, 73%, 74%, 1)",
    20: "hsla(209, 73%, 88%, 1)",
    10: "hsla(208, 79%, 96%, 1)",
    5: "hsla(208, 75%, 98%, 1)",
  },

  // Orion
  orion: {
    110: "hsla(205, 63%, 5%, 1)",
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
    100: "hsla(204, 68%, 8%, 1)",
    90: "hsla(204, 66%, 8%, 0.93)",
    80: "hsla(204, 66%, 8%, 0.84)",
    70: "hsla(204, 66%, 8%, 0.74)",
    60: "hsla(204, 66%, 8%, 0.62)",
    50: "hsla(204, 66%, 8%, 0.51)",
    40: "hsla(204, 66%, 8%, 0.44)",
    30: "hsla(204, 66%, 8%, 0.29)",
    20: "hsla(204, 66%, 8%, 0.17)",
    10: "hsla(204, 66%, 8%, 0.05)",
    5: "hsla(204, 66%, 8%, 0.02)",
  },

  // Ocean Alpha. These are not in use yet because of whitelabeling
  oceanAlpha: {
    50: "hsla(208, 95%, 42%, 0.82)",
    40: "hsla(208, 95%, 42%, 0.69)",
    30: "hsla(208, 95%, 42%, 0.45)",
    20: "hsla(208, 95%, 42%, 0.21)",
    10: "hsla(208, 95%, 42%, 0.07)",
    5: "hsla(208, 95%, 42%, 0.03)",
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
    dark: baseColors.orion[110],
  },
  "accent-gray-light": {
    light: baseColors.orion[5],
    dark: baseColors.orion[80],
  },
  "accent-gray": { light: baseColors.orion[10], dark: baseColors.orion[80] },
  "admin-navbar": {
    light: baseColors.octopus[60],
    dark: baseColors.octopus[80],
  },
  "admin-navbar-secondary": {
    light: baseColors.octopus[40],
    dark: baseColors.octopus[60],
  },
  "admin-navbar-inverse": {
    light: baseColors.octopus[80],
    dark: baseColors.octopus[60],
  },
  "background-brand": {
    light: baseColors.brand[20],
    dark: baseColors.brand[70],
  },
  "background-disabled": {
    light: baseColors.orionAlpha[10],
    dark: baseColors.orionAlphaInverse[10],
  },
  "background-disabled-inverse": {
    light: baseColors.orionAlphaInverse[10],
    dark: baseColors.orionAlpha[10],
  },
  "background-error-secondary": {
    light: baseColors.lobster[5],
    dark: baseColors.lobster[90],
  },
  "background-hover": {
    light: `color-mix(in srgb, var(--mb-color-brand) 15%, transparent)`, //baseColors.oceanAlpha[10],
    dark: `color-mix(in srgb, var(--mb-color-brand) 15%, transparent)`, //baseColors.oceanAlpha[20],
  },
  "background-hover-light": {
    light: `color-mix(in srgb, var(--mb-color-brand) 5%, transparent)`, //baseColors.oceanAlpha[5],
    dark: `color-mix(in srgb, var(--mb-color-brand) 5%, transparent)`, //baseColors.oceanAlpha[10],
  },
  "background-inverse": {
    light: baseColors.orion[80],
    dark: baseColors.orion[20],
  },
  "background-light": {
    //should be background-secondary
    light: baseColors.orion[5],
    dark: baseColors.orion[110],
  },
  "background-selected": {
    light: baseColors.brand[50],
    dark: baseColors.brand[40],
  },
  background: { light: baseColors.white, dark: baseColors.orion[100] }, //should be background-primary
  "bg-black-alpha-60": {
    //should be called overlay? this label is not semantic
    light: baseColors.orionAlpha[60],
    dark: baseColors.orionAlpha[70],
  },
  "bg-black": { light: baseColors.orion[80], dark: baseColors.orion[20] }, //should be background-primary-inverse
  "bg-dark": { light: baseColors.orion[40], dark: baseColors.orion[70] }, //should be background-tertiary-inverse
  "bg-darker": { light: baseColors.orion[70], dark: baseColors.orion[30] }, //should be background-secondary-inverse
  "bg-error": { light: baseColors.lobster[10], dark: baseColors.lobster[90] }, //should be background-error
  "background-error": {
    light: baseColors.lobster[10],
    dark: baseColors.lobster[90],
  },
  "bg-light": { light: baseColors.orion[5], dark: baseColors.orion[110] }, //should be background-secondary
  "bg-medium": { light: baseColors.orion[10], dark: baseColors.orion[80] }, //should be background-tertiary
  "bg-night": { light: baseColors.orion[70], dark: baseColors.orion[30] }, //merge with background-secondary-inverse?
  "bg-white-alpha-15": {
    light: baseColors.orionAlphaInverse[20],
    dark: baseColors.orionAlphaInverse[20],
  },
  "bg-white": {
    //should be background-primary
    light: baseColors.white,
    dark: baseColors.orion[100],
  },
  "bg-yellow": {
    light: baseColors.dubloon[5],
    dark: baseColors.dubloon[90],
  },
  "border-alpha-30": {
    //should be border
    light: baseColors.orionAlpha[20],
    dark: baseColors.orionAlphaInverse[20],
  },
  "border-dark": {
    //should be border-strong
    light: baseColors.orionAlpha[50],
    dark: baseColors.orionAlphaInverse[50],
  },
  border: {
    light: baseColors.orion[20],
    dark: baseColors.orionAlphaInverse[20],
  },
  "brand-alpha-04": {
    //all of these colors derived from brand should be reworked to fit the values in the new color palette, and to have semantic names
    light: `color-mix(in srgb, var(--mb-color-brand) 4%, transparent)`,
    dark: `color-mix(in srgb, var(--mb-color-brand) 4%, transparent)`,
  },
  "brand-alpha-88": {
    light: `color-mix(in srgb, var(--mb-color-brand) 88%, transparent)`,
    dark: `color-mix(in srgb, var(--mb-color-brand) 88%, transparent)`,
  },
  "brand-dark": {
    light: baseColors.brand[60],
    dark: baseColors.brand[30],
  },
  "brand-darker": {
    light: baseColors.brand[70],
    dark: baseColors.brand[20],
  },
  "brand-light": {
    light: baseColors.brand[10],
    dark: baseColors.brand[90],
  },
  "brand-lighter": {
    light: baseColors.brand[5],
    dark: baseColors.brand[100],
  },
  brand: {
    light: whitelabelColors.brand || baseColors.blue[40],
    dark: whitelabelColors.brand || baseColors.blue[40],
  },
  danger: {
    light: baseColors.lobster[50],
    dark: baseColors.lobster[50],
  },
  error: {
    light: baseColors.lobster[50],
    dark: baseColors.lobster[50],
  },
  filter: {
    light: whitelabelColors.filter || baseColors.octopus[50],
    dark: whitelabelColors.filter || baseColors.octopus[40],
  },
  focus: {
    light: baseColors.blue[20],
    dark: baseColors.blue[70],
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
    light: baseColors.orion[50],
    dark: baseColors.orion[50],
  },
  "metabase-brand": {
    light: baseColors.blue[40], // not for whitelabeling
    dark: baseColors.blue[40], // not for whitelabeling
  },
  "saturated-blue": {
    light: baseColors.ocean[60],
    dark: baseColors.ocean[40],
  },
  "saturated-green": {
    light: baseColors.palm[60],
    dark: baseColors.palm[40],
  },
  "saturated-purple": {
    light: baseColors.octopus[60],
    dark: baseColors.octopus[40],
  },
  "saturated-red": {
    light: baseColors.lobster[60],
    dark: baseColors.lobster[40],
  },
  "saturated-yellow": {
    light: baseColors.dubloon[30],
    dark: baseColors.dubloon[30],
  },
  "shadow-embedding-hub-card": {
    //I think this can be removed?
    light: "hsla(208, 55%, 77%, 0.70)",
    dark: "hsla(208, 55%, 77%, 0.70)",
  },
  shadow: {
    light: baseColors.orionAlpha[20],
    dark: `color-mix(in srgb, ${baseColors.orion[110]} 20%, transparent)`,
  },
  "success-darker": {
    //should be success-primary?
    light: baseColors.palm[60],
    dark: baseColors.palm[40],
  },
  success: {
    //should be success-secondary?
    light: baseColors.palm[50],
    dark: baseColors.palm[50],
  },
  summarize: {
    light: whitelabelColors.summarize || baseColors.palm[50],
    dark: whitelabelColors.summarize || baseColors.palm[40],
  },
  "switch-off": {
    light: baseColors.orionAlpha[20],
    dark: baseColors.orionAlphaInverse[20],
  },
  "syntax-parameters-active": {
    light: baseColors.mango[10],
    dark: baseColors.mango[90],
  },
  "syntax-parameters": {
    light: baseColors.mango[60],
    dark: baseColors.mango[40],
  },
  "text-brand": {
    light: baseColors.brand[50],
    dark: baseColors.brand[40],
  },
  "text-dark": {
    light: baseColors.orionAlpha[80] /* @deprecated, use text-primary */,
    dark: baseColors.orionAlphaInverse[80],
  },
  "text-disabled": {
    light: baseColors.orionAlpha[40],
    dark: baseColors.orionAlphaInverse[40],
  },
  "text-disabled-inverse": {
    light: baseColors.orionAlphaInverse[40],
    dark: baseColors.orionAlpha[40],
  },
  "text-hover": {
    light: baseColors.brand[60],
    dark: baseColors.brand[30], //CHANGED DOWN TO HERE
  },
  "text-light": {
    //should be text-disabled
    light: baseColors.orionAlpha[40],
    dark: baseColors.orionAlphaInverse[40],
  },
  "text-medium": {
    //should be text-secondary
    light: baseColors.orionAlpha[60],
    dark: baseColors.orionAlphaInverse[60],
  },
  "text-primary": {
    light: baseColors.orionAlpha[80],
    dark: baseColors.orionAlphaInverse[80],
  },
  "text-primary-inverse": {
    light: baseColors.orionAlphaInverse[80],
    dark: baseColors.orionAlpha[80],
  },
  "text-secondary": {
    light: baseColors.orionAlpha[60],
    dark: baseColors.orionAlphaInverse[60],
  },
  "text-secondary-inverse": {
    light: baseColors.orionAlphaInverse[60],
    dark: baseColors.orionAlpha[60],
  },
  "text-selected": {
    light: baseColors.white,
    dark: baseColors.white,
  },
  "text-tertiary": {
    //should be text-disabled
    light: baseColors.orionAlpha[40],
    dark: baseColors.orionAlphaInverse[40],
  },
  "text-white-alpha-85": {
    //should be text-primary-inverse
    light: baseColors.orionAlphaInverse[80],
    dark: baseColors.orionAlpha[80],
  },
  "text-white": {
    //should be text-primary-inverse
    light: baseColors.orionAlphaInverse[80],
    dark: baseColors.orionAlpha[80],
  },
  "tooltip-background-focused": {
    light: `color-mix(in srgb, ${baseColors.orion[80]} 50%, #000)`,
    dark: `color-mix(in srgb, ${baseColors.orion[70]} 50%, #000)`,
  },
  "tooltip-background": {
    light: baseColors.orion[80], // references mb-color-background-primary-inverse
    dark: baseColors.orion[70], // references mb-color-background-primary-inverse
  },
  "tooltip-text-secondary": {
    //should be text-secondary-inverse
    light: baseColors.orionAlphaInverse[60],
    dark: baseColors.orionAlphaInverse[60],
  },
  "tooltip-text": {
    light: baseColors.white,
    dark: baseColors.orionAlphaInverse[80],
  },
  warning: {
    light: baseColors.dubloon[30],
    dark: baseColors.dubloon[30],
  },

  "background-warning": {
    light: baseColors.dubloon[10],
    dark: baseColors.dubloon[60],
  },

  info: {
    light: baseColors.orion[40],
    dark: baseColors.orion[50],
  },

  "background-info": {
    light: baseColors.orion[10],
    dark: baseColors.orion[80],
  },

  white: {
    //should be changed to be semantic
    light: baseColors.white,
    dark: baseColors.orion[110],
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
  "bg-primary": {
    light: baseColors.white,
    dark: baseColors.orion[110],
  },
  "bg-secondary": {
    light: baseColors.orion[5],
    dark: baseColors.orion[100],
  },
  "bg-tertiary": {
    //I don't think this is used?
    light: baseColors.orion[10],
    dark: baseColors.orion[90],
  },
  "bg-hover": {
    //I don't think this is used?
    light: baseColors.orion[5],
    dark: baseColors.orion[90],
  },
  overlay: {
    //see the other color above where I mentioned it should be called overlay
    light: baseColors.orionAlpha[60],
    dark: "hsla(207, 100%, 4.3%, 0.8)", // FIXME: should be part of palette
  },
  "text-inverse": {
    //should be text-primary-inverse
    light: baseColors.orionAlphaInverse[80],
    dark: baseColors.orionAlpha[80],
  },
  "border-primary": {
    //should be border-strong
    light: baseColors.orionAlpha[50],
    dark: baseColors.orionAlphaInverse[50],
  },
  "border-secondary": {
    //should be border
    light: baseColors.orionAlpha[20],
    dark: baseColors.orionAlphaInverse[20],
  },
  "border-subtle": {
    light: baseColors.orionAlpha[10],
    dark: baseColors.orionAlphaInverse[10],
  },
};

export const colors: Record<keyof typeof colorConfig, string> = {
  ...Object.fromEntries(
    Object.entries(colorConfig).map(([k, v]) => [k, v.light]),
  ),
  ...whitelabelColors,
};

export const staticVizOverrides = {
  "text-dark": baseColors.orion[80],
  "text-medium": baseColors.orion[60],
  "text-light": baseColors.orion[40],
};
