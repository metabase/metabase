import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";

export interface FilterOperatorOption<T extends Lib.FilterOperatorName> {
  operator: T;

  // An operator's longDisplayName is going to be used by default,
  // but widgets can overwrite it with a custom name.
  name?: string;
}

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
