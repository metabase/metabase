import type {
  ColumnDisplayInfo,
  ColumnMetadata,
  FilterClause,
  ExpressionClause,
  SegmentDisplayInfo,
  SegmentMetadata,
  Query,
} from "metabase-lib/types";

export interface FilterPickerWidgetProps {
  query: Query;
  stageIndex: number;
  column: ColumnMetadata;
  filter?: FilterClause;
  isNew: boolean;
  onChange: (filter: ExpressionClause) => void;
  onBack?: () => void;
}

export interface PickerOperatorOption<Operator> {
  operator: Operator;

  // An operator's longDisplayName is going to be used by default,
  // but widgets can overwrite it with a custom name.
  name?: string;
}

export type ColumnListItem = ColumnDisplayInfo & {
  column: ColumnMetadata;
};

export type SegmentListItem = SegmentDisplayInfo & {
  segment: SegmentMetadata;
};
