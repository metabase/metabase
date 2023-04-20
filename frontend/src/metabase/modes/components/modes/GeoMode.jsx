import PivotDrill from "../drill/PivotDrill";
import DefaultMode from "./DefaultMode";

const GeoMode = {
  name: "geo",
  drills: [...DefaultMode.drills, PivotDrill],
};

export default GeoMode;
