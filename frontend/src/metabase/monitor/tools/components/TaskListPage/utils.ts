import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import type {
  ListTasksSortColumn,
  SortDirection,
  SortingOptions,
  TaskStatus,
} from "metabase-types/api";

export const TASK_SORT_COLUMNS = [
  "started_at",
  "ended_at",
  "duration",
  "task",
  "status",
  "db_name",
  "db_engine",
] satisfies readonly ListTasksSortColumn[];

const DEFAULT_SORT_COLUMN: ListTasksSortColumn = "started_at";
const DEFAULT_SORT_DIRECTION = "desc";

export const DEFAULT_SORTING: SortingOptions<ListTasksSortColumn> = {
  sort_column: DEFAULT_SORT_COLUMN,
  sort_direction: DEFAULT_SORT_DIRECTION,
};

type UrlState = {
  page: number;
  sort_column: ListTasksSortColumn;
  sort_direction: SortDirection;
  status: TaskStatus | null;
  task: string | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(
      query.sort_column,
      TASK_SORT_COLUMNS,
      DEFAULT_SORT_COLUMN,
    ),
    sort_direction: parseSortDirection(
      query.sort_direction,
      DEFAULT_SORT_DIRECTION,
    ),
    status: parseStatus(query.status),
    task: parseTask(query.task),
  }),
  serialize: ({ page, sort_column, sort_direction, status, task }) => ({
    page: page === 0 ? undefined : String(page),
    sort_column: sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
    status: status === null ? undefined : status,
    task: task === null ? undefined : task,
  }),
};

function parseStatus(param: QueryParam): UrlState["status"] {
  const value = getFirstParamValue(param);
  return value && isTaskStatus(value) ? value : null;
}

function isTaskStatus(value: string): value is TaskStatus {
  return ["success", "started", "failed", "unknown"].includes(value);
}

function parseTask(param: QueryParam): UrlState["task"] {
  const value = getFirstParamValue(param);
  return value && value.trim().length > 0 ? value.trim() : null;
}
