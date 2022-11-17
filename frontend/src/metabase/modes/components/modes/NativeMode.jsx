import FallbackNativeDrill from "../drill/FallbackNativeDrill";
import DefaultMode from "./DefaultMode";

const NativeMode = {
  name: "native",
  drills: DefaultMode.drills,
  fallback: FallbackNativeDrill,
};

export default NativeMode;
