import { getObjectKeys } from "metabase/utils/objects";

import type { MetabaseColorKey } from "../types";

import { ALL_ACCENT_COLOR_NAMES } from "./accents";
import { METABASE_LIGHT_THEME } from "./themes/light";

/** All color names available in Metabase themes. */
export const ALL_COLOR_NAMES: MetabaseColorKey[] = [
  ...getObjectKeys(METABASE_LIGHT_THEME.colors),
  ...ALL_ACCENT_COLOR_NAMES,
];
