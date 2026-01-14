/* eslint-disable no-color-literals -- we define chart colors here to avoid duplication */

import type { ChartColorV2 } from "../types";

/**
 * Default chart colors for Metabase.
 * These are transformed into accent0 - accent7 via mapChartColorsToAccents.
 */
export const DEFAULT_CHART_COLORS: ChartColorV2[] = [
  "#509EE3", // accent0 - blue
  "#88BF4D", // accent1 - green
  "#A989C5", // accent2 - purple
  "#EF8C8C", // accent3 - red
  "#F9D45C", // accent4 - yellow
  "#F2A86F", // accent5 - orange
  "#98D9D9", // accent6 - cyan
  "#7172AD", // accent7 - indigo
];
