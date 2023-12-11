import type * as Lib from "metabase-lib/types";

export interface ColumnItem {
  column: Lib.ColumnMetadata;
  columnInfo: Lib.ColumnDisplayInfo;
}

export interface ColumnGroupItem {
  key: string;
  group: Lib.ColumnGroup;
  groupInfo: Lib.ColumnGroupDisplayInfo;
  columnItems: ColumnItem[];
  stageIndex: number;
}

export interface FilterEditorProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
}
