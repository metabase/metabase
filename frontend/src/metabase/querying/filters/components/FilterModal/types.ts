import type * as Lib from "metabase-lib";

export interface FilterEditorProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
  onInput: () => void;
}
