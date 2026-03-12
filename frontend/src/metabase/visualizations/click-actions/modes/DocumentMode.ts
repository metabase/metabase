import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

export const DocumentMode: QueryClickActionsMode = {
  name: "document-mode",
  hasDrills: true,
  clickActions: [HideColumnAction, ColumnFormattingAction],
  fallback: NativeQueryClickFallback,
  availableOnlyDrills: [
    "drill-thru/automatic-insights",
    "drill-thru/column-extract",
    "drill-thru/column-filter",
    "drill-thru/combine-columns",
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

    // we want to skip "drill-thru/zoom"
  ],
};
