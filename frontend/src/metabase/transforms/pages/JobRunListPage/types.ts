import type {
  SortDirection,
  TransformJobRunSortColumn,
} from "metabase-types/api";

export type JobRunSortOptions = {
  column: TransformJobRunSortColumn;
  direction: SortDirection;
};
