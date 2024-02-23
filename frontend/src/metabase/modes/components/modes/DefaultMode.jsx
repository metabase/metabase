import { AutomaticInsightsDrill } from "../drill/AutomaticInsightsDrill";
import { ColumnFilterDrill } from "../drill/ColumnFilterDrill";
import DashboardClickDrill from "../drill/DashboardClickDrill";
import ForeignKeyDrill from "../drill/ForeignKeyDrill";
import FormatDrill from "../drill/FormatDrill";
import { ObjectDetailDrill } from "../drill/ObjectDetailDrill";
import { QuickFilterDrill } from "../drill/QuickFilterDrill";
import SortDrill from "../drill/SortDrill";
import UnderlyingRecordsDrill from "../drill/UnderlyingRecordsDrill";
import ZoomDrill from "../drill/ZoomDrill";

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
