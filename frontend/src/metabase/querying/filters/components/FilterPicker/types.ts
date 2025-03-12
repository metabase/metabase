import type * as Lib from "metabase-lib";

export interface FilterPickerWidgetProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew: boolean;
  onChange: (filter: Lib.ExpressionClause) => void;
  onBack?: () => void;
}

export interface PickerOperatorOption<Operator> {
  operator: Operator;

  // An operator's longDisplayName is going to be used by default,
  // but widgets can overwrite it with a custom name.
  name?: string;
}

export type ColumnListItem = {
  name: string;
  displayName: string;
  column: Lib.ColumnMetadata;
  stageIndex: number;
};

export type SegmentListItem = Lib.SegmentDisplayInfo & {
  name: string;
  displayName: string;
  segment: Lib.SegmentMetadata;
  stageIndex: number;
};
