import type * as Lib from "metabase-lib";

export interface FilterItem {
  filter: Lib.FilterClause;
  stageIndex: number;
}
