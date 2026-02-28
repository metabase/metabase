import type {
  ReplaceSourceColumnErrorType,
  ReplaceSourceColumnInfo,
} from "metabase-types/api";

export type ColumnMappingItem = {
  id: number;
  source: ReplaceSourceColumnInfo | null;
  target: ReplaceSourceColumnInfo | null;
  errors?: ReplaceSourceColumnErrorType[];
};
