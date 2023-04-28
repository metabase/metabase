import PivotDrill from "../drill/PivotDrill";
import DefaultMode from "./DefaultMode";

const MetricMode = {
  name: "metric",
  drills: [...DefaultMode.drills, PivotDrill],
};

export default MetricMode;
