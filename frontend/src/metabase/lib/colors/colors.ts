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

export const colors = {
  "accent-gray-dark": baseColors.orion[20],
  "accent-gray-light": baseColors.orion[5],
  "accent-gray": baseColors.orion[10],
  "admin-navbar": baseColors.octopus[60],
  "background-brand": baseColors.brand[40],
  "background-disabled": baseColors.orion[10],
  "background-error-secondary": baseColors.lobster[5],
  "background-hover": baseColors.brand[10],
  "background-info": baseColors.orion[5],
  "background-inverse": baseColors.orion[80],
  "background-light": baseColors.orion[5],
  "background-selected": baseColors.brand[40],
  background: baseColors.white,
  "bg-black-alpha-60": `color-mix(in srgb, ${baseColors.orion[80]} 60%, transparent)`,
  "bg-black": baseColors.orion[80],
  "bg-dark": baseColors.orion[40],
  "bg-darker": baseColors.orion[70],
  "bg-error": baseColors.lobster[10],
  "bg-light": baseColors.orion[5],
  "bg-medium": baseColors.orion[10],
  "bg-night": baseColors.orion[70],
  "bg-white-alpha-15": `color-mix(in srgb, ${baseColors.white} 15%, transparent)`,
  "bg-white": baseColors.white,
  "bg-yellow": baseColors.dubloon[5],
  "border-alpha-30": "color-mix(in srgb, #eeecec 30%, transparent)",
  "border-dark": baseColors.orion[60],
  border: baseColors.orion[20],
  "brand-alpha-04": `color-mix(in srgb, ${baseColors.blue[40]} 4%, transparent)`,
  "brand-alpha-88": `color-mix(in srgb, ${baseColors.blue[40]} 88%, transparent)`,
  "brand-dark": baseColors.brand[60],
  "brand-darker": baseColors.brand[70],
  "brand-light": `color-mix(in srgb, ${baseColors.blue[40]}, #fff 80%)`,
  "brand-lighter": `color-mix(in srgb, ${baseColors.blue[40]}, #fff 90%)`,
  brand: baseBrand,
  danger: baseColors.lobster[50],
  error: baseColors.lobster[50],
  filter: baseColors.octopus[50],
  focus: baseColors.blue[20],
  "icon-primary-disabled": baseColors.orion[30],
  "icon-primary": baseColors.brand[40],
  "icon-secondary-disabled": baseColors.orion[10],
  "icon-secondary": baseColors.brand[20],
  "metabase-brand": baseColors.blue[40], // not for whitelabeling
  "saturated-blue": "hsla(208, 66%, 50%, 1.00)",
  "saturated-green": "hsla(90, 48%, 44%, 1.00)",
  "saturated-purple": "hsla(272, 36%, 52%, 1.00)",
  "saturated-red": "hsla(0, 78%, 68%, 1.00)",
  "saturated-yellow": "hsla(46, 94%, 63%, 1.00)",
  "shadow-embedding-hub-card": "hsla(208, 55%, 77%, 0.70)",
  shadow: "hsla(0, 0%, 0%, 0.13)",
  "success-darker": baseColors.palm[60],
  success: baseColors.palm[50],
  summarize: baseColors.palm[40],
  "switch-off": baseColors.orion[10],
  "syntax-parameters-active": baseColors.mango[10],
  "syntax-parameters": baseColors.mango[40],
  "text-brand": baseColors.brand[40],
  "text-dark": baseColors.orion[80],
  "text-disabled": baseColors.orion[50],
  "text-hover": baseColors.brand[40],
  "text-light": baseColors.orion[40],
  "text-medium": baseColors.orion[60],
  "text-primary": baseColors.orion[80],
  "text-secondary-inverse": baseColors.orion[30],
  "text-secondary": baseColors.orion[60],
  "text-selected": baseColors.white,
  "text-tertiary": baseColors.orion[40],
  "text-white-alpha-85": `color-mix(in srgb, ${baseColors.white} 85%, transparent)`,
  "text-white": baseColors.white,
  "tooltip-background-focused": `color-mix(in srgb, ${baseColors.orion[80]} 50%, #000)`,
  "tooltip-background": baseColors.orion[80], // references mb-color-background-inverse
  "tooltip-text-secondary": baseColors.orion[40], // references mb-color-text-light
  "tooltip-text": baseColors.white,
  warning: baseColors.dubloon[30],

  white: baseColors.white,
  // Legacy colors (keeping existing ones for backward compatibility)
  accent0: "#509EE3",
  accent1: "#88BF4D",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F2A86F",
  accent6: "#98D9D9",
  accent7: "#7172AD",
  ...whitelabelColors,
};
