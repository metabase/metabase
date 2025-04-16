import type {
  QueryParam,
  UrlStateConfig,
} from "metabase/common/hooks/use-url-state";
import type { ListTasksRequest, TaskStatus } from "metabase-types/api";

type SortColumn = NonNullable<ListTasksRequest["sort_column"]>;

const DEFAULT_SORT_COLUMN = "started_at";
const DEFAULT_SORT_DIRECTION = "desc";

type UrlState = {
  page: number;
  sort_column: SortColumn;
  sort_direction: "asc" | "desc";
  status: TaskStatus | null;
  task: string | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(query.sort_column),
    sort_direction: parseSortDirection(query.sort_direction),
    status: parseStatus(query.status),
    task: parseTask(query.task),
  }),
  serialize: ({ page, sort_column, sort_direction, status, task }) => ({
    page: page === 0 ? undefined : String(page),
    sort_column: sort_column === null ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
    status: status === null ? undefined : status,
    task: task === null ? undefined : task,
  }),
};

function parsePage(param: QueryParam): UrlState["page"] {
  const value = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseSortColumn(param: QueryParam): UrlState["sort_column"] {
  const value = Array.isArray(param) ? param[0] : param;
  return value && isSortColumn(value) ? value : DEFAULT_SORT_COLUMN;
}

function isSortColumn(value: string): value is SortColumn {
  return ["started_at", "ended_at", "duration"].includes(value);
}

function parseSortDirection(param: QueryParam): UrlState["sort_direction"] {
  const value = Array.isArray(param) ? param[0] : param;
  return value === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
}

function parseStatus(param: QueryParam): UrlState["status"] {
  const value = Array.isArray(param) ? param[0] : param;
  return value && isTaskStatus(value) ? value : null;
}

function isTaskStatus(value: string): value is TaskStatus {
  return ["success", "started", "failed", "unknown"].includes(value);
}

function parseTask(param: QueryParam): UrlState["task"] {
  const value = Array.isArray(param) ? param[0] : param;
  return value && value.trim().length > 0 ? value.trim() : null;
}
