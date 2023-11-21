import type * as Lib from "metabase-lib";

interface FilterPickerBodyProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew?: boolean;
  onChange: (filter: Lib.ExpressionClause) => void;
  onBack?: () => void;
}

export function FilterPickerBody(props: FilterPickerBodyProps) {
  return <div />;
}
