/* @flow */

import type { QueryMode } from "metabase/meta/types/Visualization";
import { getDefaultDrills } from "../drill";

const NativeMode: QueryMode = {
  name: "native",
  drills: getDefaultDrills,
};

export default NativeMode;
