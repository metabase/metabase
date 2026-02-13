import type { ReplaceSourceErrorType } from "metabase-types/api";

export type ReplaceSourceErrorGroup = {
  type: ReplaceSourceErrorType;
  count: number;
};
