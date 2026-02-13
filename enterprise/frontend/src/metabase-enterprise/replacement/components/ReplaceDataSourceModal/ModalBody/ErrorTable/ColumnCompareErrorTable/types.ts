import type { ReplaceSourceColumnCompareInfo } from "metabase-types/api";

export type ColumnCompareErrorItem = {
  id: string;
  compare: ReplaceSourceColumnCompareInfo;
};
