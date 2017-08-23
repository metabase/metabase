/* @flow */

import SortAction from "./SortAction";
import ObjectDetailDrill from "./ObjectDetailDrill";
import QuickFilterDrill from "./QuickFilterDrill";
import UnderlyingRecordsDrill from "./UnderlyingRecordsDrill";
import ZoomDrill from "./ZoomDrill";

export const DEFAULT_DRILLS = [
    ZoomDrill,
    SortAction,
    ObjectDetailDrill,
    QuickFilterDrill,
    UnderlyingRecordsDrill
];
