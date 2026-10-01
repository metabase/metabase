import type { MetabaseColorKey } from "../types";
import { DERIVED_COLOR_KEYS } from "../types/theme";

import { ALL_ACCENT_COLOR_NAMES } from "./accents";
import { getLightTheme } from "./themes/light";

/** All color names available in Metabase themes. */
export const ALL_COLOR_NAMES = Object.keys(getLightTheme().colors)
  .concat(ALL_ACCENT_COLOR_NAMES)
  .concat(DERIVED_COLOR_KEYS) as MetabaseColorKey[];
