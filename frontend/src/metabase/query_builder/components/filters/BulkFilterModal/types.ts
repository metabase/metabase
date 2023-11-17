import type * as Lib from "metabase-lib/types";

export interface FilterPickerWidgetProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter?: Lib.ExpressionClause) => void;
}
