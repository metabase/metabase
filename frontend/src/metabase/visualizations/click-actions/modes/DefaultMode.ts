import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";
import { ExtractColumnAction } from "../actions/ExtractColumn/ExtractColumn";
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
  ],
  fallback: NativeQueryClickFallback,
};
