import SummarizeColumnDrill from "metabase/visualizations/click-actions/drills/SummarizeColumnDrill";
import DistributionDrill from "metabase/visualizations/click-actions/drills/DistributionDrill";
import SummarizeColumnByTimeDrill from "metabase/visualizations/click-actions/drills/SummarizeColumnByTimeDrill";
import type { QueryClickActionsMode } from "../../types";
import { DefaultMode } from "./DefaultMode";

export const SegmentMode: QueryClickActionsMode = {
  name: "segment",
  clickActions: [
    ...DefaultMode.clickActions,
    SummarizeColumnDrill,
    SummarizeColumnByTimeDrill,
    DistributionDrill,
  ],
};
