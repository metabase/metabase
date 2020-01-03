/* @flow */

import type { QueryMode } from "metabase/meta/types/Visualization";
import CompoundQueryAction from "../actions/CompoundQueryAction";
import SortAction from "../drill/SortAction";

const NativeMode: QueryMode = {
  name: "native",
  actions: [CompoundQueryAction],
  drills: [SortAction],
};

export default NativeMode;
