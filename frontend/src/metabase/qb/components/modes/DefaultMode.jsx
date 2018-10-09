/* @flow */

import { DEFAULT_ACTIONS } from "../actions";
import { DEFAULT_DRILLS } from "../drill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const DefaultMode: QueryMode = {
  name: "default",
  actions: DEFAULT_ACTIONS,
  drills: DEFAULT_DRILLS,
};

export default DefaultMode;
