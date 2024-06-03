import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { CombineColumnsAction } from "../actions/CombineColumnsAction";
import { CompareAggregationsAction } from "../actions/CompareAggregationsAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";
import { ExtractColumnAction } from "../actions/ExtractColumnAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  hasDrills: true,
  clickActions: [
    HideColumnAction,
    ColumnFormattingAction,
    DashboardClickAction,
    ExtractColumnAction,
    CombineColumnsAction,
    CompareAggregationsAction,
  ],
  fallback: NativeQueryClickFallback,
};
