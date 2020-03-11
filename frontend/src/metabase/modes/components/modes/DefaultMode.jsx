/* @flow */

import { getDefaultDrills } from "../drill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const DefaultMode: QueryMode = {
  name: "default",
  drills: getDefaultDrills,
};

export default DefaultMode;
