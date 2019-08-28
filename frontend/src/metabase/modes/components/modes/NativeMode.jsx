/* @flow */

import type { QueryMode } from "metabase/meta/types/Visualization";
import CompoundQueryAction from "../actions/CompoundQueryAction";

const NativeMode: QueryMode = {
  name: "native",
  actions: [CompoundQueryAction],
  drills: [],
};

export default NativeMode;
