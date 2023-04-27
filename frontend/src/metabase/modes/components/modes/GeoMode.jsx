import { getPivotDrill } from "../drill/PivotDrill";
import DefaultMode from "./DefaultMode";

const GeoMode = {
  name: "geo",
  drills: [...DefaultMode.drills, getPivotDrill({ withLocation: false })],
};

export default GeoMode;
