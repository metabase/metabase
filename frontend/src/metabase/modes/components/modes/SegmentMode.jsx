import DistributionDrill from "../drill/DistributionDrill";
import SummarizeColumnByTimeDrill from "../drill/SummarizeColumnByTimeDrill";
import SummarizeColumnDrill from "../drill/SummarizeColumnDrill";

import DefaultMode from "./DefaultMode";

const SegmentMode = {
  name: "segment",
  drills: [
    ...DefaultMode.drills,
    SummarizeColumnDrill,
    SummarizeColumnByTimeDrill,
    DistributionDrill,
  ],
};

export default SegmentMode;
