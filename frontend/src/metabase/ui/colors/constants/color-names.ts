import type { MetabaseColorKey } from "../types";

import { ALL_ACCENT_COLOR_NAMES } from "./accents";
import { getLightTheme } from "./themes/light";

/** All color names available in Metabase themes. */
export const ALL_COLOR_NAMES = Object.keys(getLightTheme().colors).concat(
  ALL_ACCENT_COLOR_NAMES,
) as MetabaseColorKey[];
