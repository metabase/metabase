import type * as Lib from "metabase-lib";

export interface ColumnOption {
  value: string;
  label: string;
  column: Lib.ColumnMetadata;
}
