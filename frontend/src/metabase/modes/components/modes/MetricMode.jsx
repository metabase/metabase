import { getDefaultDrills } from "../drill";

import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";

const MetricMode = {
  name: "metric",
  drills: () => [
    ...getDefaultDrills(),
    PivotByCategoryDrill,
    PivotByLocationDrill,
    PivotByTimeDrill,
  ],
};

export default MetricMode;
