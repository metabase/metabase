import { METABASE_DARK_THEME } from "./constants/dark";
import { METABASE_LIGHT_THEME } from "./constants/light";
import type { MetabaseThemeV2 } from "./types";

/** Returns the theme definition for a color scheme. */
export const getThemeFromColorScheme = (
  colorScheme: "light" | "dark",
): MetabaseThemeV2 =>
  colorScheme === "dark" ? METABASE_DARK_THEME : METABASE_LIGHT_THEME;
