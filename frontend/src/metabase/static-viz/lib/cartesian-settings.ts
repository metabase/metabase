import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { RawSeries } from "metabase-types/api";

/**
 * In static viz the chart size is fixed and small, so an ordinal scale on a
 * date column often can't fit any labels (even rotated), leaving subscribers
 * with no axis context. Default to a timeseries scale in that case — it
 * handles intermediate tick spacing intelligently and is the better
 * representation for date data per design guidance (UXW-58 / metabase#29852).
 *
 * Interactive viz keeps the user's chosen scale, because dashcards can be
 * resized to fit ordinal labels.
 */
export function getStaticCartesianChartSettings(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  if (settings["graph.x_axis.scale"] !== "ordinal") {
    return settings;
  }
  const xColName = settings["graph.dimensions"]?.[0];
  if (!xColName) {
    return settings;
  }
  const xCol = rawSeries[0]?.data?.cols?.find((col) => col.name === xColName);
  if (!xCol || !isDate(xCol)) {
    return settings;
  }
  return { ...settings, "graph.x_axis.scale": "timeseries" };
}
