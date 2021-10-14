import { getDefaultDrills } from "../drill";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

const GeoMode = {
  name: "geo",
  drills: () => [...getDefaultDrills(), PivotByCategoryDrill, PivotByTimeDrill],
};

export default GeoMode;
