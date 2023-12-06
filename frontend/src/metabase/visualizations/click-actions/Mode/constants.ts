import type { Drill } from "metabase/visualizations/types/click-actions";
import type { DrillThruType } from "metabase-lib";

export const MODE_TYPE_DEFAULT = "default";
export const MODE_TYPE_NATIVE = "native";
export const MODE_TYPE_SEGMENT = "segment";
export const MODE_TYPE_METRIC = "metric";
export const MODE_TYPE_TIMESERIES = "timeseries";
export const MODE_TYPE_GEO = "geo";
export const MODE_TYPE_PIVOT = "pivot";

export const MODES_TYPES = [
  MODE_TYPE_NATIVE,
  MODE_TYPE_SEGMENT,
  MODE_TYPE_METRIC,
  MODE_TYPE_TIMESERIES,
  MODE_TYPE_GEO,
  MODE_TYPE_PIVOT,
  MODE_TYPE_DEFAULT,
] as const;

export const DRILL_TYPE_TO_HANDLER_MAP: Record<
  DrillThruType,
  Drill<any> | null
> = {
  "drill-thru/automatic-insights": null,
  "drill-thru/column-filter": null,
  "drill-thru/distribution": null,
  "drill-thru/fk-details": null,
  "drill-thru/fk-filter": null,
  "drill-thru/pivot": null,
  "drill-thru/pk": null,
  "drill-thru/quick-filter": null,
  "drill-thru/sort": null,
  "drill-thru/summarize-column-by-time": null,
  "drill-thru/summarize-column": null,
  "drill-thru/underlying-records": null,
  "drill-thru/zoom": null,
  "drill-thru/zoom-in.binning": null,
  "drill-thru/zoom-in.geographic": null,
  "drill-thru/zoom-in.timeseries": null,
};
