import SortDrill from "../drill/SortDrill";
import ObjectDetailDrill from "../drill/ObjectDetailDrill";
import QuickFilterDrill from "../drill/QuickFilterDrill";
import ForeignKeyDrill from "../drill/ForeignKeyDrill";
import ColumnFilterDrill from "../drill/ColumnFilterDrill";
import UnderlyingRecordsDrill from "../drill/UnderlyingRecordsDrill";
import AutomaticDashboardDrill from "../drill/AutomaticDashboardDrill";
import CompareToRestDrill from "../drill/CompareToRestDrill";
import ZoomDrill from "../drill/ZoomDrill";
import FormatDrill from "../drill/FormatDrill";
import DashboardClickDrill from "../drill/DashboardClickDrill";

const DefaultMode = {
  name: "default",
  drills: [
    ZoomDrill,
    SortDrill,
    ObjectDetailDrill,
    QuickFilterDrill,
    ForeignKeyDrill,
    ColumnFilterDrill,
    UnderlyingRecordsDrill,
    AutomaticDashboardDrill,
    CompareToRestDrill,
    FormatDrill,
    DashboardClickDrill,
  ],
};

export default DefaultMode;
