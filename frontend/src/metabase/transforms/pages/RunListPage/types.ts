import type {
  SortDirection,
  TransformId,
  TransformRunMethod,
  TransformRunSortColumn,
  TransformRunStatus,
  TransformTagId,
} from "metabase-types/api";

export type TransformRunFilterOptions = {
  statuses?: TransformRunStatus[];
  transformIds?: TransformId[];
  transformTagIds?: TransformTagId[];
  startTime?: string;
  endTime?: string;
  runMethods?: TransformRunMethod[];
};

export type TransformRunSortOptions = {
  column: TransformRunSortColumn;
  direction: SortDirection;
};
