import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByLocationDrill from "../drill/PivotByLocationDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";
import DefaultMode from "./DefaultMode";

const PivotMode = {
  name: "pivot",
  drills: [
    ...DefaultMode.drills,
    PivotByCategoryDrill,
    PivotByLocationDrill,
    PivotByTimeDrill,
  ],
};

export default PivotMode;
