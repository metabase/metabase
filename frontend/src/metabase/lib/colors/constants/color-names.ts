import type { MetabaseColorKey } from "../types";

import { METABASE_LIGHT_THEME } from "./light";

export const ALL_ACCENT_COLOR_NAMES = [
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
] as const;

/** All color names available in Metabase themes. */
export const ALL_COLOR_NAMES = Object.keys(METABASE_LIGHT_THEME.colors).concat(
  ALL_ACCENT_COLOR_NAMES,
) as MetabaseColorKey[];
