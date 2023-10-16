import { AutomaticInsightsDrill } from "metabase/visualizations/click-actions/drills/AutomaticInsightsDrill";
import UnderlyingRecordsDrill from "metabase/visualizations/click-actions/drills/UnderlyingRecordsDrill";
import { QuickFilterDrill } from "metabase/visualizations/click-actions/drills/QuickFilterDrill";
import { ObjectDetailDrill } from "metabase/visualizations/click-actions/drills/ObjectDetailDrill";
import ZoomDrill from "metabase/visualizations/click-actions/drills/ZoomDrill";
import { ColumnFilterDrill } from "metabase/visualizations/click-actions/drills/ColumnFilterDrill";
import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    UnderlyingRecordsDrill,
    ZoomDrill,
    ObjectDetailDrill,
    QuickFilterDrill,
    ColumnFilterDrill,
    AutomaticInsightsDrill,
    ColumnFormattingAction,
    DashboardClickAction,
  ],
};
