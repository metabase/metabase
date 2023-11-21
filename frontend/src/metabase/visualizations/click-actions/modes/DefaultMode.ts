import { ColumnFilterDrill } from "metabase/visualizations/click-actions/drills/ColumnFilterDrill";
import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    ColumnFilterDrill,
    HideColumnAction,
    ColumnFormattingAction,
    DashboardClickAction,
  ],
};
