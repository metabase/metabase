/* @flow */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import PivotByCategoryAction from "../actions/PivotByCategoryAction";
import PivotByTimeAction from "../actions/PivotByTimeAction";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const GeoMode: QueryMode = {
  name: "geo",
  actions: [...DEFAULT_ACTIONS, PivotByCategoryAction, PivotByTimeAction],
  drills: [...DEFAULT_DRILLS, PivotByCategoryDrill, PivotByTimeDrill],
};

export default GeoMode;
