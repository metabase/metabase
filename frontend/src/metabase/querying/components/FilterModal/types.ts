import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";

export interface ColumnItem {
  column: Lib.ColumnMetadata;
  displayName: string;
  stageIndex: number;
}

export interface SegmentItem {
  segment: Lib.SegmentMetadata;
  displayName: string;
  stageIndex: number;
  filterPositions: number[];
}

export interface GroupItem {
  key: string;
  displayName: string;
  icon: IconName;
  columnItems: ColumnItem[];
  segmentItems: SegmentItem[];
}

export interface FilterEditorProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  isSearching: boolean;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
  onInput: () => void;
}
