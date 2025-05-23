import type * as Lib from "metabase-lib";

export type FilterPickerWidgetProps = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew: boolean;
  withAddButton: boolean;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
};

export type FilterChangeOpts = {
  run?: boolean;
};

export type ColumnListItem = {
  name: string;
  displayName: string;
  column: Lib.ColumnMetadata;
  stageIndex: number;
  filterPositions?: number[];
};

export type SegmentListItem = Lib.SegmentDisplayInfo & {
  name: string;
  displayName: string;
  segment: Lib.SegmentMetadata;
  stageIndex: number;
};
