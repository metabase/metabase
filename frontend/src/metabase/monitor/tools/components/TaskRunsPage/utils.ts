import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import { isSortColumn } from "metabase/utils/sorting";
import type {
  ListTaskRunsSortColumn,
  SortDirection,
  SortingOptions,
  TaskRunDateFilterOption,
  TaskRunEntityType,
  TaskRunStatus,
  TaskRunType,
} from "metabase-types/api";

import {
  guardTaskRunEntityType,
  guardTaskRunRunType,
  guardTaskRunStartedAtRange,
  guardTaskRunStatus,
} from "../../utils";

export const TASK_RUN_SORT_COLUMNS = [
  "started_at",
  "ended_at",
  "run_type",
  "status",
  "entity_name",
  "task_count",
] satisfies readonly ListTaskRunsSortColumn[];

const DEFAULT_SORT_COLUMN: ListTaskRunsSortColumn = "started_at";
const DEFAULT_SORT_DIRECTION = "desc";

export const DEFAULT_SORTING: SortingOptions<ListTaskRunsSortColumn> = {
  sort_column: DEFAULT_SORT_COLUMN,
  sort_direction: DEFAULT_SORT_DIRECTION,
};

type UrlState = {
  page: number;
  sort_column: ListTaskRunsSortColumn;
  sort_direction: SortDirection;
  "run-type": TaskRunType | null;
  "entity-type": TaskRunEntityType | null;
  "entity-id": number | null;
  status: TaskRunStatus | null;
  "started-at": TaskRunDateFilterOption | null;
  "include-today": boolean;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    sort_column: parseSortColumn(query.sort_column),
    sort_direction: parseSortDirection(query.sort_direction),
    "run-type": parseTaskRunRunType(query["run-type"]),
    "entity-type": parseTaskRunEntityType(query["entity-type"]),
    "entity-id": parseTaskRunEntityId(query["entity-id"]),
    status: parseTaskRunStatus(query.status),
    "started-at": parseTaskRunStartedAt(query["started-at"]),
    "include-today": parseIncludeToday(query["include-today"]),
  }),
  serialize: ({
    page,
    sort_column,
    sort_direction,
    "run-type": runType,
    "entity-type": entityType,
    "entity-id": entityId,
    status,
    "started-at": startedAt,
    "include-today": includeToday,
  }) => ({
    page: page === 0 ? undefined : String(page),
    sort_column: sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
    "run-type": runType === null ? undefined : runType,
    "entity-type": entityType === null ? undefined : entityType,
    "entity-id": entityId === null ? undefined : String(entityId),
    status: status === null ? undefined : status,
    "started-at": startedAt === null ? undefined : startedAt,
    "include-today": includeToday ? "true" : undefined,
  }),
};

function parseSortColumn(param: QueryParam): UrlState["sort_column"] {
  const value = getFirstParamValue(param);
  return value && isSortColumn(value, TASK_RUN_SORT_COLUMNS)
    ? value
    : DEFAULT_SORT_COLUMN;
}

function parseSortDirection(param: QueryParam): UrlState["sort_direction"] {
  const value = getFirstParamValue(param);
  return value === "asc" ? "asc" : DEFAULT_SORT_DIRECTION;
}

const parsePage = (param: QueryParam): UrlState["page"] => {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const parseTaskRunRunType = (param: QueryParam): UrlState["run-type"] => {
  const value = getFirstParamValue(param);
  return value && guardTaskRunRunType(value) ? value : null;
};

const parseTaskRunEntityType = (param: QueryParam): UrlState["entity-type"] => {
  const value = getFirstParamValue(param);
  return value && guardTaskRunEntityType(value) ? value : null;
};

const parseTaskRunEntityId = (param: QueryParam): UrlState["entity-id"] => {
  const value = getFirstParamValue(param);
  if (!value) {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTaskRunStatus = (param: QueryParam): UrlState["status"] => {
  const value = getFirstParamValue(param);
  return value && guardTaskRunStatus(value) ? value : null;
};

const parseTaskRunStartedAt = (param: QueryParam): UrlState["started-at"] => {
  const value = getFirstParamValue(param);
  return value && guardTaskRunStartedAtRange(value) ? value : null;
};

const parseIncludeToday = (param: QueryParam): UrlState["include-today"] => {
  return getFirstParamValue(param) === "true";
};
