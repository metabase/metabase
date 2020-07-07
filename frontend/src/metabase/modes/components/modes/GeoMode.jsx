/* @flow */

import { getDefaultDrills } from "../drill";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

import type { QueryMode } from "metabase-types/types/Visualization";

const GeoMode: QueryMode = {
  name: "geo",
  drills: () => [...getDefaultDrills(), PivotByCategoryDrill, PivotByTimeDrill],
};

export default GeoMode;
