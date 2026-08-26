import type { MetabaseColorKey } from "../types";
import { DERIVED_COLOR_KEYS } from "../types/theme";

import { ALL_ACCENT_COLOR_NAMES } from "./accents";
import { METABASE_LIGHT_THEME } from "./themes/light";

/** All color names available in Metabase themes. */
export const ALL_COLOR_NAMES = Object.keys(METABASE_LIGHT_THEME.colors)
  .concat(ALL_ACCENT_COLOR_NAMES)
  .concat(DERIVED_COLOR_KEYS) as MetabaseColorKey[];
