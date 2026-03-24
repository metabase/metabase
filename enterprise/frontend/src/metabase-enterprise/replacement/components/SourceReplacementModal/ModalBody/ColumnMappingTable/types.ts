import type {
  SourceReplacementColumnErrorType,
  SourceReplacementColumnInfo,
} from "metabase-types/api";

export type ColumnMappingItem = {
  id: number;
  source?: SourceReplacementColumnInfo;
  target?: SourceReplacementColumnInfo;
  errors?: SourceReplacementColumnErrorType[];
};
