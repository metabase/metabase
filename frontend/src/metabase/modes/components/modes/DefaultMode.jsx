/* @flow */

import { getDefaultDrills } from "../drill";

import type { QueryMode } from "metabase-types/types/Visualization";

const DefaultMode: QueryMode = {
  name: "default",
  drills: getDefaultDrills,
};

export default DefaultMode;
