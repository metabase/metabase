import SummarizeColumnDrill from "../drill/SummarizeColumnDrill";
import SummarizeColumnByTimeDrill from "../drill/SummarizeColumnByTimeDrill";
import DistributionDrill from "../drill/DistributionDrill";
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
