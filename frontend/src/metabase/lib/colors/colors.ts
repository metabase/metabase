/* eslint-disable no-color-literals */
// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCHRONIZED WITH:
// frontend/src/metabase/css/core/colors.module.css
// frontend/src/metabase/styled-components/containers/GlobalStyles/GlobalStyles.tsx
// frontend/src/metabase/styled-components/theme/css-variables.ts
// NOTE: this file is used in the embedding SDK, so it should not contain anything else except the `colors` constant.

import C from "color";

import type { ColorSettings } from "metabase-types/api/settings";
import { generateSteps } from "./utils";
import { CssColor } from "@adobe/leonardo-contrast-colors";
import Color from "color";

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
    100: "hsla(206, 16%, 8%, 1.00)", // background-primary-inverse
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
    110: "hsla(205, 63%, 0%, 1)",
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

  // Ocean Alpha. These are not in use yet because of whitelabeling
  oceanAlpha: {
    50: "hsla(208, 95%, 42%, 0.82)",
    40: "hsla(208, 95%, 42%, 0.69)",
    30: "hsla(208, 95%, 42%, 0.45)",
    20: "hsla(208, 95%, 42%, 0.21)",
    10: "hsla(208, 95%, 42%, 0.07)",
    5: "hsla(208, 95%, 42%, 0.03)",
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

const getColorConfig = (settings: ColorSettings = {}) => {
  const {
    background = baseColors.white,
    text = baseColors.orionAlpha[80],
    brand = baseColors.blue[40],
  } = settings;

  const config = generateSteps({
    text,
    brand,
    background,
  });

  // const config = {
  //   ...generateSteps(
  //     Color(background).hsl().toString(),
  //     Color(background).hsl().toString(),
  //     "background",
  //   ),
  //   ...generateSteps(
  //     Color(text).hsl().toString(),
  //     Color(background).hsl().toString(),
  //     "text",
  //   ),
  //   ...generateSteps(
  //     Color(brand).hsl().toString(),
  //     Color(background).hsl().toString(),
  //     "brand",
  //   ),
  // };

  return {
    "accent-gray-dark": baseColors.orion[20],

    "accent-gray-light": baseColors.orion[5],

    "accent-gray": baseColors.orion[10],

    "admin-navbar": baseColors.octopus[60],

    "admin-navbar-secondary": baseColors.octopus[40],

    "admin-navbar-inverse": baseColors.octopus[80],

    "background-brand": config.brand[20],

    "background-disabled": config.backgroundAlpha[10],

    "background-disabled-inverse": config.backgroundAlphaInverse[10],

    "background-error-secondary": baseColors.lobster[5],

    "background-hover": `color-mix(in srgb, var(--mb-color-brand) 21%, transparent)`, //baseColors.oceanAlpha[20],

    "background-hover-light": `color-mix(in srgb, var(--mb-color-brand) 7%, transparent)`, //baseColors.oceanAlpha[10],

    "background-selected": config.brand[50],

    "background-primary": config.background[5],

    "background-secondary": config.background[10],

    "background-tertiary": config.background[20],

    "background-primary-inverse": config.background[80],

    "background-secondary-inverse": config.background[70],

    // Only used one place
    "background-tertiary-inverse": config.background[40],

    overlay: config.backgroundAlpha[60],

    "background-error": baseColors.lobster[10],

    //all of these colors derived from brand should be reworked to fit the values in the new color palette, and to have semantic names
    "brand-alpha-04": `color-mix(in srgb, var(--mb-color-brand) 4%, transparent)`,

    "brand-alpha-88": `color-mix(in srgb, var(--mb-color-brand) 88%, transparent)`,

    "brand-dark": config.brand[60],

    "brand-darker": config.brand[70],

    "brand-light": config.brand[10],

    "brand-lighter": config.brand[5],

    brand: settings.brand || baseColors.blue[40],

    danger: baseColors.lobster[50],

    error: baseColors.lobster[50],

    filter: settings.filter || baseColors.octopus[50],

    focus: baseColors.blue[20],

    "icon-primary-disabled": config.text[30],

    "icon-primary": config.brand[40],

    "icon-secondary-disabled": config.text[10],

    "icon-secondary": config.text[50],

    "metabase-brand": baseColors.blue[40], // not for whitelabeling

    "saturated-blue": baseColors.ocean[60],

    "saturated-green": baseColors.palm[60],

    "saturated-purple": baseColors.octopus[60],

    "saturated-red": baseColors.lobster[60],

    "saturated-yellow": baseColors.dubloon[30],

    shadow: config.backgroundAlpha[20],

    "success-secondary": baseColors.palm[60],

    success: baseColors.palm[50],

    summarize: settings.summarize || baseColors.palm[50],

    "switch-off": config.textAlpha[20],

    "syntax-parameters-active": baseColors.mango[10],

    "syntax-parameters": baseColors.mango[60],

    "text-brand": config.brand[50],

    "text-disabled": config.textAlpha[40],

    "text-disabled-inverse": config.textAlphaInverse[40],

    "text-hover": config.brand[60],

    //Used in gauge viz... there should be a better way to do this
    "text-secondary-opaque": config.text[60],

    "text-primary": config.textAlpha[80],

    "text-primary-inverse": config.textAlphaInverse[80],

    "text-secondary": config.textAlpha[60],

    "text-secondary-inverse": config.textAlphaInverse[60],

    "text-selected": baseColors.white,

    "tooltip-background-focused": `color-mix(in srgb, ${config.background[80]} 50%, #000)`,

    "tooltip-background": config.background[80], // references mb-color-background-primary-inverse

    //should be text-secondary-inverse
    "tooltip-text-secondary": config.textAlphaInverse[60],

    "tooltip-text": baseColors.white,

    warning: baseColors.dubloon[30],

    "background-warning": baseColors.dubloon[5],

    info: config.background[40],

    "background-info": config.background[10],

    //should be changed to be semantic
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

    border: config.background[20],

    "border-strong": config.backgroundAlpha[50],

    "border-subtle": config.backgroundAlpha[10],

    // one-off colors for data layers which are not part of Metabase color palette
    // we got a blessing from the design team to use these colors 😇
    copper: "#B87333",

    bronze: "#CD7F32",

    silver: "#C0C0C0",

    gold: "#FFD700",
  };
};

export const colorConfig = getColorConfig(whitelabelColors);

export const getColors = (settings?: ColorSettings) =>
  ({
    ...Object.fromEntries(
      Object.entries(getColorConfig(settings)).map(([k, v]) => [k, v]),
    ),
    ...settings,
  }) as Record<keyof typeof colorConfig, string>;

export const getDarkColors = (settings?: ColorSettings) =>
  ({
    ...Object.fromEntries(
      Object.entries(getColorConfig(settings)).map(([k, v]) => [k, v.dark]),
    ),
    ...settings,
  }) as Record<keyof typeof colorConfig, string>;

export const colors = getColors(whitelabelColors);

export const mutateColors = (settings: ColorSettings) => {
  Object.assign(colorConfig, getColorConfig(settings));

  // Empty the `colors` object to make sure we don't hold onto previously defined (now undefined) values
  Object.keys(colors).forEach((key) => {
    delete colors[key as keyof typeof colors];
  });
  Object.assign(colors, getColors(settings));
};

export const staticVizOverrides = {
  "text-primary": baseColors.orion[80],
  "text-secondary": baseColors.orion[60],
  "text-disabled": baseColors.orion[40],
};
