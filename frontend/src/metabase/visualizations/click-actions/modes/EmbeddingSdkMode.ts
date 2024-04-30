import type { QueryClickActionsMode } from "../../types";
import { DashboardClickAction } from "../actions/DashboardClickAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

export const EmbeddingSdkMode: QueryClickActionsMode = {
  name: "embedding-sdk",
  hasDrills: true,
  availableOnlyDrills: [
    "drill-thru/column-extract",
    "drill-thru/column-filter",
    "drill-thru/distribution",
    "drill-thru/fk-details",
    "drill-thru/fk-filter",
    "drill-thru/pivot",
    "drill-thru/pk",
    "drill-thru/quick-filter",
    "drill-thru/sort",
    "drill-thru/summarize-column-by-time",
    "drill-thru/summarize-column",
    "drill-thru/underlying-records",
    "drill-thru/zoom-in.binning",
    "drill-thru/zoom-in.geographic",
    "drill-thru/zoom-in.timeseries",
  ],
  clickActions: [HideColumnAction, DashboardClickAction],
  fallback: NativeQueryClickFallback,
};
