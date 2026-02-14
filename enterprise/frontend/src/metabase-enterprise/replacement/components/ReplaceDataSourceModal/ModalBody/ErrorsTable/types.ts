import type { ReplaceSourceColumnInfo } from "metabase-types/api";

export type ErrorItem = {
  id: string;
  column: ReplaceSourceColumnInfo;
};
