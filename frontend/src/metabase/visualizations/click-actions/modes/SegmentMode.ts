import type { QueryMode } from "../types";
import SummarizeColumnDrill from "../drills/SummarizeColumnDrill";
import SummarizeColumnByTimeDrill from "../drills/SummarizeColumnByTimeDrill";
import DistributionDrill from "../drills/DistributionDrill";
import { DefaultMode } from "./DefaultMode";

export const SegmentMode: QueryMode = {
  name: "segment",
  drills: [
    ...DefaultMode.drills,
    SummarizeColumnDrill,
    SummarizeColumnByTimeDrill,
    DistributionDrill,
  ],
};
