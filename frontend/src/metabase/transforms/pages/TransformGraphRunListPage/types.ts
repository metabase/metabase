import type {
  SortDirection,
  TransformGraphRunSortColumn,
  TransformGraphRunType,
  TransformId,
  TransformRunStatus,
} from "metabase-types/api";

export type TransformGraphRunFilterOptions = {
  types?: TransformGraphRunType[];
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  startTime?: string;
};

export type TransformGraphRunSortOptions = {
  column: TransformGraphRunSortColumn;
  direction: SortDirection;
};
