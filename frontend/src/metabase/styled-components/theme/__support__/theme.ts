/* eslint-disable metabase/no-color-literals -- fixed customer palette fixtures for CSS derivation tests */
import {
  DEFAULT_METABASE_COMPONENT_THEME,
  type MantineTheme,
} from "metabase/ui";

export const LIGHT_COLORS: Record<string, string> = {
  "background_page-primary": "#ffffff",
  "background-primary": "#ffffff",
  "text-primary": "#111111",
  border: "#dcdfe0",
  brand: "#509ee3",
};

export function createTheme(
  colors = LIGHT_COLORS,
  other: Partial<MantineTheme["other"]> = {},
) {
  return {
    fontFamilyMonospace: "Monaco, monospace",
    fn: { themeColor: (name: string) => colors[name] ?? name },
    other: {
      ...DEFAULT_METABASE_COMPONENT_THEME,
      colorScheme: "light" as const,
      updateColorSettings: () => {},
      ...other,
    },
  } satisfies Pick<MantineTheme, "fontFamilyMonospace" | "fn" | "other">;
}
