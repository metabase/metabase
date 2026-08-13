import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { CombineColumnsAction } from "../actions/CombineColumnsAction";
import { CopyValueAction } from "../actions/CopyValueAction";
import { ExtractColumnAction } from "../actions/ExtractColumnAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

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
