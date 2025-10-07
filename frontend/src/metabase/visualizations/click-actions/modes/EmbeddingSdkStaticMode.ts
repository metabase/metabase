import { CombineColumnsAction } from "metabase/visualizations/click-actions/actions/CombineColumnsAction";
import { DashboardClickAction } from "metabase/visualizations/click-actions/actions/DashboardClickAction";
import { ExtractColumnAction } from "metabase/visualizations/click-actions/actions/ExtractColumnAction";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";
import { NativeQueryClickFallback } from "metabase/visualizations/click-actions/actions/NativeQueryClickFallback";
import type { QueryClickActionsMode } from "metabase/visualizations/types";

/*export const EmbeddingSdkStaticMode: QueryClickActionsMode = {
  name: "embedding-sdk-static",
  hasDrills: false,
  clickActions: [DashboardClickAction],
};*/

// All drills are enabled for testing
export const EmbeddingSdkStaticMode: QueryClickActionsMode = {
  name: "embedding-sdk-static",
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
  clickActions: [
    HideColumnAction,
    DashboardClickAction,
    ExtractColumnAction,
    CombineColumnsAction,
  ],
  fallback: NativeQueryClickFallback,
};
