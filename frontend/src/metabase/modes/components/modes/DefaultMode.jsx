import SortDrill from "../drill/SortDrill";
import ObjectDetailDrill from "../drill/ObjectDetailDrill";
import { QuickFilterDrill } from "../drill/QuickFilterDrill";
import ForeignKeyDrill from "../drill/ForeignKeyDrill";
import { ColumnFilterDrill } from "../drill/ColumnFilterDrill";
import UnderlyingRecordsDrill from "../drill/UnderlyingRecordsDrill";
import { AutomaticInsightsDrill } from "../drill/AutomaticInsightsDrill";
import ZoomDrill from "../drill/ZoomDrill";
import FormatDrill from "../drill/FormatDrill";
import DashboardClickDrill from "../drill/DashboardClickDrill";

const DefaultMode = {
  name: "default",
  drills: [
    UnderlyingRecordsDrill,
    ZoomDrill,
    SortDrill,
    ObjectDetailDrill,
    QuickFilterDrill,
    ForeignKeyDrill,
    ColumnFilterDrill,
    AutomaticInsightsDrill,
    FormatDrill,
    DashboardClickDrill,
  ],
};

export default DefaultMode;
