import type {
  ColumnMetadata,
  FilterClause,
  ExpressionClause,
  Query,
} from "metabase-lib/types";

export interface FilterPickerWidgetProps {
  query: Query;
  stageIndex: number;
  column: ColumnMetadata;
  filter?: FilterClause;
  onChange: (filter: ExpressionClause) => void;
  onBack: () => void;
}

export interface PickerOperatorOption<Operator> {
  operator: Operator;

  // An operator's longDisplayName is going to be used by default,
  // but widgets can overwrite it with a custom name.
  name?: string;
}
