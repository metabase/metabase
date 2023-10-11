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
  name: string;
  operator: Operator;
}
