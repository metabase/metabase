import { Mode } from "metabase/querying/click-actions/Mode";
import { NativeQueryClickFallback } from "metabase/querying/click-actions/actions/NativeQueryClickFallback";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import { ColumnFormattingAction } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";
import type { ClickActionsMode } from "metabase/visualizations/types";

const DocumentMode: QueryClickActionsMode = {
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

export const documentClickActionMode: ClickActionsMode = new Mode(
  () => DocumentMode,
);
