import type {
  ReplaceSourceColumnInfo,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export type ColumnMappingItem = {
  id: number;
  source?: ReplaceSourceColumnInfo;
  target?: ReplaceSourceColumnInfo;
  errors?: ReplaceSourceErrorType[];
};
