import { AutomaticInsightsDrill } from "metabase/visualizations/click-actions/drills/AutomaticInsightsDrill";
import ZoomDrill from "metabase/visualizations/click-actions/drills/ZoomDrill";
import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    ZoomDrill,
    AutomaticInsightsDrill,
    ColumnFormattingAction,
    DashboardClickAction,
  ],
};
