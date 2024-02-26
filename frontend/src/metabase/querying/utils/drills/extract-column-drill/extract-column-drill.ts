import type { Drill } from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";

export const extractColumnDrill: Drill<Lib.SummarizeColumnDrillThruInfo> = ({
  query: _query,
  stageIndex: _stageIndex,
  drill: _drill,
}) => {
  return [];
};
