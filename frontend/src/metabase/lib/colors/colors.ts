/* eslint-disable no-color-literals */
// NOTE: DO NOT ADD COLORS WITHOUT EXTREMELY GOOD REASON AND DESIGN REVIEW
// NOTE: KEEP SYNCHRONIZED WITH:
// frontend/src/metabase/css/core/colors.module.css
// frontend/src/metabase/styled-components/containers/GlobalStyles/GlobalStyles.tsx
// frontend/src/metabase/styled-components/theme/css-variables.ts
// NOTE: this file is used in the embedding SDK, so it should not contain anything else except the `colors` constant.
export const colors = {
  brand: "#509EE3",
  summarize: "#88BF4D",
  filter: "#7172AD",
  accent0: "#509EE3",
  accent1: "#88BF4D",
  accent2: "#A989C5",
  accent3: "#EF8C8C",
  accent4: "#F9D45C",
  accent5: "#F2A86F",
  accent6: "#98D9D9",
  accent7: "#7172AD",
  "accent-gray": "#F3F3F4", // Orion 10 (--mb-base-color-orion-10)
  "accent-gray-light": "#FAFAFB", // Orion 5 (--mb-base-color-orion-5)
  "accent-gray-dark": "#DCDFE0", // Orion 20 (--mb-base-color-orion-20)
  "admin-navbar": "#7172AD",
  white: "#FFFFFF",
  success: "#84BB4C",
  // --mb-base-color-lobster-50
  danger: "hsla(358, 71%, 62%, 1)",
  error: "hsla(358, 71%, 62%, 1)",
  warning: "#F9CF48",
  "text-dark": "#4C5773",
  "text-medium": "#696E7B",
  "text-light": "#949AAB",
  "text-white": "#FFFFFF",
  "text-secondary-inverse": "#B7BCBF",
  "bg-black": "#2E353B",
  "bg-dark": "#93A1AB",
  "bg-medium": "#EDF2F5",
  "bg-light": "#F9FBFC",
  "bg-white": "#FFFFFF",
  "bg-yellow": "#FFFCF2",
  "bg-night": "#42484E",
  // --mb-base-color-lobster-10
  "bg-error": "hsla(0, 76%, 97%, 1)",
  shadow: "rgba(0,0,0,0.08)",
  border: "#dcdfe0", // orion-20

  /* Saturated colors for the SQL editor. Shouldn't be used elsewhere since they're not white-labelable. */
  "saturated-blue": "#2D86D4",
  "saturated-green": "#70A63A",
  "saturated-purple": "#885AB1",
  "saturated-red": "#ED6E6E",
  "saturated-yellow": "#F9CF48",
};
