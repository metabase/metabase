import type { ResolvedColorScheme } from "../color-scheme";

import { METABASE_DARK_THEME } from "./constants/themes/dark";
import { METABASE_LIGHT_THEME } from "./constants/themes/light";
import type { MetabaseThemeV2 } from "./types";

/** Returns the theme definition for a color scheme. */
export const getThemeFromColorScheme = (
  colorScheme: ResolvedColorScheme,
): MetabaseThemeV2 =>
  colorScheme === "dark" ? METABASE_DARK_THEME : METABASE_LIGHT_THEME;
