/* @flow */

import { getDefaultDrills } from "../drill";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const PivotMode: QueryMode = {
  name: "pivot",
  drills: () => [
    ...getDefaultDrills(),
    PivotByCategoryDrill,
    PivotByLocationDrill,
    PivotByTimeDrill,
  ],
};

export default PivotMode;
