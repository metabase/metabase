/* @flow */

import ObjectDetailDrill from "../drill/ObjectDetailDrill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const ObjectMode: QueryMode = {
  name: "object",
  drills: () => [ObjectDetailDrill],
};

export default ObjectMode;
