/* @flow */

import { getDefaultDrills } from "../drill";

import SummarizeColumnDrill from "../drill/SummarizeColumnDrill";
import SummarizeColumnByTimeDrill from "../drill/SummarizeColumnByTimeDrill";
import DistributionDrill from "../drill/DistributionDrill";

import type { QueryMode } from "metabase-types/types/Visualization";

const SegmentMode: QueryMode = {
  name: "segment",
  drills: () => [
    ...getDefaultDrills(),
    SummarizeColumnDrill,
    SummarizeColumnByTimeDrill,
    DistributionDrill,
  ],
};

export default SegmentMode;
