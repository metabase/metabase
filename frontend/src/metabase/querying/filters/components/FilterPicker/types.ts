import type { DefinedClauseName } from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";

export type FilterPickerWidgetProps = {
  autoFocus: boolean;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
  isNew: boolean;
  withAddButton: boolean;
  withSubmitButton: boolean;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
  readOnly?: boolean;
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
  combinedDisplayName: string;
};

export type SegmentListItem = Lib.SegmentDisplayInfo & {
  name: string;
  displayName: string;
  segment: Lib.SegmentMetadata;
  stageIndex: number;
};

export type ExpressionClauseItem = {
  type: "expression-clause";
  clause: DefinedClauseName;
  displayName: string;
};
