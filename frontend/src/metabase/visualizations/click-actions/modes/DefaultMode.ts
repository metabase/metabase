import { AutomaticInsightsDrill } from "metabase/visualizations/click-actions/drills/AutomaticInsightsDrill";
import { QuickFilterDrill } from "metabase/visualizations/click-actions/drills/QuickFilterDrill";
import { ObjectDetailDrill } from "metabase/visualizations/click-actions/drills/ObjectDetailDrill";
import ZoomDrill from "metabase/visualizations/click-actions/drills/ZoomDrill";
import { ColumnFilterDrill } from "metabase/visualizations/click-actions/drills/ColumnFilterDrill";
import SortDrill from "metabase/visualizations/click-actions/drills/SortDrill";
import ForeignKeyDrill from "metabase/visualizations/click-actions/drills/ForeignKeyDrill";
import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { HideColumnAction } from "../actions/HideColumnAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    ZoomDrill,
    SortDrill,
    ObjectDetailDrill,
    QuickFilterDrill,
    ForeignKeyDrill,
    ColumnFilterDrill,
    AutomaticInsightsDrill,
    HideColumnAction,
    ColumnFormattingAction,
    DashboardClickAction,
  ],
};
