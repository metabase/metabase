import { AutomaticInsightsDrill } from "metabase/visualizations/click-actions/drills/AutomaticInsightsDrill";
import { ColumnFilterDrill } from "metabase/visualizations/click-actions/drills/ColumnFilterDrill";
import ForeignKeyDrill from "metabase/visualizations/click-actions/drills/ForeignKeyDrill";
import { ObjectDetailDrill } from "metabase/visualizations/click-actions/drills/ObjectDetailDrill";
import { QuickFilterDrill } from "metabase/visualizations/click-actions/drills/QuickFilterDrill";
import SortDrill from "metabase/visualizations/click-actions/drills/SortDrill";
import UnderlyingRecordsDrill from "metabase/visualizations/click-actions/drills/UnderlyingRecordsDrill";
import ZoomDrill from "metabase/visualizations/click-actions/drills/ZoomDrill";

import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";
import { HideColumnAction } from "../actions/HideColumnAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    UnderlyingRecordsDrill,
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
