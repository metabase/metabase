/* eslint-disable */
import type {
  MetabaseColors,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";

/**
 * Dark preset colors derived from the Metabase color palette.
 * These values come from `colorConfig` in `metabase/lib/colors/colors.ts`.
 */
const DARK_PRESET_COLORS: MetabaseColors = {
  background: "#1b1919",
  "text-primary": "#f5f6f7",
  "background-hover": "rgb(41, 38, 38)",
  "background-disabled": "rgb(32, 30, 30)",
  "background-secondary": "rgb(22, 20, 20)",
  "background-light": "rgb(43, 40, 40)",
  "text-secondary": "rgb(163, 172, 181)",
  "text-tertiary": "rgb(88, 98, 109)",
  border: "rgba(220, 223, 224, 0.7)",
  "brand-hover": "rgba(80, 158, 226, 0.5)",
  "brand-hover-light": "rgba(80, 158, 226, 0.3)",
};

export const applyThemePreset = (
  theme: MetabaseTheme | undefined,
): MetabaseTheme | undefined => {
  switch (theme?.preset) {
    case "light":
      return theme;
    case "dark":
      return {
        ...theme,
        colors: {
          ...DARK_PRESET_COLORS,
          ...theme.colors,
        },
      };
    default:
      return theme;
  }
};
