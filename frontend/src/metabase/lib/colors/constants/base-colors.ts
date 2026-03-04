/* eslint-disable metabase/no-color-literals */
// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW

/**
 * Base color palette for Metabase themes.
 * These colors are used to define the light and dark themes.
 */
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

/**
 * These base colors are only for use in defining `light.ts` and `dark.ts` themes.
 *
 * Don't use it for anything else or you will be fired.
 */
export const getBaseColorsForThemeDefinitionOnly = () => baseColors;
