import type { SegmentedControlItem } from "metabase/ui";
import type { DependencySortColumn, SortDirection } from "metabase-types/api";

export type SortColumnItem = {
  value: DependencySortColumn;
  label: string;
};

export type SortDirectionItem = SegmentedControlItem<SortDirection>;
