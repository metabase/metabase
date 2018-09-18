/* @flow */

import SortAction from "./SortAction";
import ObjectDetailDrill from "./ObjectDetailDrill";
import QuickFilterDrill from "./QuickFilterDrill";
import UnderlyingRecordsDrill from "./UnderlyingRecordsDrill";
import AutomaticDashboardDrill from "./AutomaticDashboardDrill";
import CompareToRestDrill from "./CompareToRestDrill";
import ZoomDrill from "./ZoomDrill";

export const DEFAULT_DRILLS = [
  ZoomDrill,
  SortAction,
  ObjectDetailDrill,
  QuickFilterDrill,
  UnderlyingRecordsDrill,
  AutomaticDashboardDrill,
  CompareToRestDrill,
];
