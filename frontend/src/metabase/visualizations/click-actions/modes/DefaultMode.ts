import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  hasDrills: true,
  clickActions: [
    HideColumnAction,
    ColumnFormattingAction,
    DashboardClickAction,
  ],
  fallback: NativeQueryClickFallback,
};
