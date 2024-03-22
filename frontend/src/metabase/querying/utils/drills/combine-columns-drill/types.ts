import type * as Lib from "metabase-lib";

export type ColumnAndSeparator = {
  separator: string;
  column: Lib.ColumnMetadata;
};

export type ColumnOption = {
  label: string;
  value: string;
  column: Lib.ColumnMetadata;
};
