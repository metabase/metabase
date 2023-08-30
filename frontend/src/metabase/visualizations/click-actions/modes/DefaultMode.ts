import SortDrill from "../drills/SortDrill";
import { ObjectDetailDrill } from "../drills/ObjectDetailDrill";
import { QuickFilterDrill } from "../drills/QuickFilterDrill";
import { ColumnFilterDrill } from "../drills/ColumnFilterDrill";
import UnderlyingRecordsDrill from "../drills/UnderlyingRecordsDrill";
import { AutomaticInsightsDrill } from "../drills/AutomaticInsightsDrill";
import ZoomDrill from "../drills/ZoomDrill";
import type { QueryClickActionsMode } from "../../types";
import { ColumnFormattingAction } from "../actions/ColumnFormattingAction";
import { DashboardClickAction } from "../actions/DashboardClickAction";

export const DefaultMode: QueryClickActionsMode = {
  name: "default",
  clickActions: [
    UnderlyingRecordsDrill,
    ZoomDrill,
    SortDrill,
    ObjectDetailDrill,
    QuickFilterDrill,
    ColumnFilterDrill,
    AutomaticInsightsDrill,
    ColumnFormattingAction,
    DashboardClickAction,
  ],
};
