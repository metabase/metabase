/* @flow */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";
import PivotByLocationAction from "../actions/PivotByLocationAction";
import PivotByTimeAction from "../actions/PivotByTimeAction";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const PivotMode: QueryMode = {
  name: "pivot",
  actions: [
    ...DEFAULT_ACTIONS,
    PivotByCategoryAction,
    PivotByLocationAction,
    PivotByTimeAction,
  ],
  drills: [
    ...DEFAULT_DRILLS,
    PivotByCategoryDrill,
    PivotByLocationDrill,
    PivotByTimeDrill,
  ],
};

export default PivotMode;
