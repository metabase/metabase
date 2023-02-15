import PivotByCategoryDrill from "../drill/PivotByCategoryDrill";
import PivotByTimeDrill from "../drill/PivotByTimeDrill";
import DefaultMode from "./DefaultMode";

const GeoMode = {
  name: "geo",
  drills: [...DefaultMode.drills, PivotByCategoryDrill, PivotByTimeDrill],
};

export default GeoMode;
