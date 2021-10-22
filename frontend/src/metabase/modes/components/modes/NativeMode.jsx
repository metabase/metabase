import { getDefaultDrills } from "../drill";

import type { QueryMode } from "metabase-types/types/Visualization";

const NativeMode: QueryMode = {
  name: "native",
  drills: getDefaultDrills,
};

export default NativeMode;
