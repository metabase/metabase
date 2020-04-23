/* @flow */

import SortAction from "./SortAction";
import ObjectDetailDrill from "./ObjectDetailDrill";
import QuickFilterDrill from "./QuickFilterDrill";
import ColumnFilterDrill from "./ColumnFilterDrill";
import UnderlyingRecordsDrill from "./UnderlyingRecordsDrill";
import AutomaticDashboardDrill from "./AutomaticDashboardDrill";
import CompareToRestDrill from "./CompareToRestDrill";
import ZoomDrill from "./ZoomDrill";
import FormatAction from "./FormatAction";

import { PLUGIN_DRILLS } from "metabase/plugins";

export const getDefaultDrills = () => [
  ZoomDrill,
  SortAction,
  ObjectDetailDrill,
  QuickFilterDrill,
  ColumnFilterDrill,
  UnderlyingRecordsDrill,
  AutomaticDashboardDrill,
  CompareToRestDrill,
  FormatAction,
  ...PLUGIN_DRILLS,
];
