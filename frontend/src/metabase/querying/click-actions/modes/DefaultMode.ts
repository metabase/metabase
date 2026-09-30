import { ColumnFormattingAction } from "metabase/visualizations/click-actions/actions/ColumnFormattingAction";
import { HideColumnAction } from "metabase/visualizations/click-actions/actions/HideColumnAction";

import { AddFormulaColumnAction } from "../actions/AddFormulaColumnAction";
import { CopyValueAction } from "../actions/CopyValueAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";
import type { QueryClickActionsMode } from "../types";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  hasDrills: true,
  clickActions: [
    CopyValueAction,
    HideColumnAction,
    ColumnFormattingAction,
    // Replaces the previously-separate ExtractColumnAction and
    // CombineColumnsAction with one general "Add formula column" entry —
    // see AddFormulaColumnAction's own comment for why.
    AddFormulaColumnAction,
  ],
  fallback: NativeQueryClickFallback,
};
