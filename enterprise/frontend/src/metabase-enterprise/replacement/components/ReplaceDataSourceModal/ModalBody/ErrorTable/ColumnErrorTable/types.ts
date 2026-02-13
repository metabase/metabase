import type { ReplaceSourceColumnInfo } from "metabase-types/api";

export type ColumnErrorItem = {
  id: string;
  column: ReplaceSourceColumnInfo;
};
