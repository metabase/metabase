import type {
  ReplaceSourceColumnErrorType,
  ReplaceSourceColumnInfo,
} from "metabase-types/api";

export type ColumnMappingItem = {
  id: number;
  source?: ReplaceSourceColumnInfo;
  target?: ReplaceSourceColumnInfo;
  errors?: ReplaceSourceColumnErrorType[];
};
