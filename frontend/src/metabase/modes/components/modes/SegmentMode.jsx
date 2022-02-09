import { getDefaultDrills } from "../drill";

import SummarizeColumnDrill from "../drill/SummarizeColumnDrill";
import SummarizeColumnByTimeDrill from "../drill/SummarizeColumnByTimeDrill";
import DistributionDrill from "../drill/DistributionDrill";

const SegmentMode = {
  name: "segment",
  drills: () => [
    ...getDefaultDrills(),
    SummarizeColumnDrill,
    SummarizeColumnByTimeDrill,
    DistributionDrill,
  ],
};

export default SegmentMode;
