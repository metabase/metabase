import { getDefaultDrills } from "../drill";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

const PivotMode = {
  name: "pivot",
  drills: () => [
    ...getDefaultDrills(),
    PivotByCategoryDrill,
    PivotByLocationDrill,
    PivotByTimeDrill,
  ],
};

export default PivotMode;
