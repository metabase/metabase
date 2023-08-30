import type { QueryClickActionsMode } from "../../types";
import SummarizeColumnDrill from "../drills/SummarizeColumnDrill";
import DistributionDrill from "../drills/DistributionDrill";
import { DefaultMode } from "./DefaultMode";

export const SegmentMode: QueryClickActionsMode = {
  name: "segment",
  clickActions: [
    ...DefaultMode.clickActions,
    SummarizeColumnDrill,
    DistributionDrill,
  ],
};
