import type {
  SortDirection,
  TransformGraphRunSortColumn,
  TransformGraphRunType,
  TransformId,
  TransformRunMethod,
  TransformRunStatus,
} from "metabase-types/api";

export type TransformGraphRunFilterOptions = {
  types?: TransformGraphRunType[];
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  startTime?: string;
  endTime?: string;
  runMethods?: TransformRunMethod[];
};

export type TransformGraphRunSortOptions = {
  column: TransformGraphRunSortColumn;
  direction: SortDirection;
};
