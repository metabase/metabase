import { AutomaticInsightsDrill } from "metabase/visualizations/click-actions/drills/AutomaticInsightsDrill";
import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    ColumnFormattingAction,
    DashboardClickAction,
    AutomaticInsightsDrill,
  ],
};
