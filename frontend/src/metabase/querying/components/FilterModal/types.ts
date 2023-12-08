import type * as Lib from "metabase-lib/types";

export interface GroupItem {
  key: string;
  group: Lib.ColumnGroup;
  groupInfo: Lib.ColumnGroupDisplayInfo;
  columns: Lib.ColumnMetadata[];
  stageIndex: number;
}

export interface FilterPickerWidgetProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
}
