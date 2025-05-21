import type * as Lib from "metabase-lib";

export interface FilterItem {
  filter: Lib.FilterClause;
  filterIndex: number;
  stageIndex: number;
}
