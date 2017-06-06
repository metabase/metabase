/* @flow */

import ObjectDetailDrill from "../drill/ObjectDetailDrill";

import type { QueryMode } from "metabase/meta/types/Visualization";

const SegmentMode: QueryMode = {
    name: "object",
    actions: [],
    drills: [ObjectDetailDrill]
};

export default SegmentMode;
