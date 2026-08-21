import { ColumnFormattingAction } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";
import type { QueryClickActionsMode } from "metabase/visualizations/types";

import { CombineColumnsAction } from "../actions/CombineColumnsAction";
import { ExtractColumnAction } from "../actions/ExtractColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  hasDrills: true,
  clickActions: [
    HideColumnAction,
    ColumnFormattingAction,
    ExtractColumnAction,
    CombineColumnsAction,
  ],
  fallback: NativeQueryClickFallback,
};
