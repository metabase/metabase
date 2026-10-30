import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

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
  clause: Lib.DefinedClauseName;
  displayName: string;
};

/** An entry a caller adds to a column group, such as a segment it keeps itself. */
export type CustomListItem = {
  type: "custom";
  key: string;
  name: string;
  displayName: string;
  icon: IconName;
};

/** A column group, for a caller deciding which entries of its own it gets. */
export type ColumnGroupItemsContext = {
  info: Lib.ColumnGroupDisplayInfo;
  columns: Lib.ColumnMetadata[];
  stageIndex: number;
};
