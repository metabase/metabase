import { PivotDrill } from "../drill/PivotDrill";
import DefaultMode from "./DefaultMode";

const PivotMode = {
  name: "pivot",
  drills: [...DefaultMode.drills, PivotDrill],
};

export default PivotMode;
