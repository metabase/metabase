import { ColumnFormattingAction } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";

import { CombineColumnsAction } from "../actions/CombineColumnsAction";
import { CopyValueAction } from "../actions/CopyValueAction";
import { ExtractColumnAction } from "../actions/ExtractColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";
import type { QueryClickActionsMode } from "../types";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  hasDrills: true,
  clickActions: [
    CopyValueAction,
    HideColumnAction,
    ColumnFormattingAction,
    ExtractColumnAction,
    CombineColumnsAction,
  ],
  fallback: NativeQueryClickFallback,
};
