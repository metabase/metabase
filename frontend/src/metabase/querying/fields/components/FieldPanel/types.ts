import type * as Lib from "metabase-lib";

export type ColumnItem = {
  column: Lib.ColumnMetadata;
  displayName: string;
  isSelected: boolean;
  isDisabled: boolean;
};

export type ColumnGroupItem = {
  columnItems: ColumnItem[];
  displayName: string;
  isSelected: boolean;
  isDisabled: boolean;
  isSourceGroup: boolean;
};
