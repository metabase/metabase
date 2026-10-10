import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import type {
  ListTaskRunsSortColumn,
  SortDirection,
  SortingOptions,
  TaskRunDateFilterOption,
  TaskRunEntityType,
  TaskRunType,
} from "metabase-types/api";

import {
  guardTaskRunEntityType,
  guardTaskRunRunType,
  guardTaskRunStartedAtRange,
} from "../../utils";
import type { TaskRunOutcome } from "../TaskRunStatusPicker/TaskRunStatusPicker";

export const TASK_RUN_SORT_COLUMNS = [
  "started_at",
  "entity_name",
] satisfies readonly ListTaskRunsSortColumn[];

const DEFAULT_SORT_COLUMN: ListTaskRunsSortColumn = "started_at";
const DEFAULT_SORT_DIRECTION = "desc";

export const DEFAULT_SORTING: SortingOptions<ListTaskRunsSortColumn> = {
  sort_column: DEFAULT_SORT_COLUMN,
  sort_direction: DEFAULT_SORT_DIRECTION,
};

export type TaskRunsTab = "tasks" | "scheduled";

type UrlState = {
  page: number;
  tab: TaskRunsTab;
  status: TaskRunOutcome | null;
  sort_column: ListTaskRunsSortColumn;
  sort_direction: SortDirection;
  "run-type": TaskRunType | null;
  "entity-type": TaskRunEntityType | null;
  "entity-id": number | null;
  "started-at": TaskRunDateFilterOption | null;
  "include-today": boolean;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => {
    // entity-type and entity-id only filter meaningfully as a pair (the picker
    // shows a value only when both are set, and the backend needs the type to
    // interpret the id), so drop both when either is missing.
    const entityType = parseTaskRunEntityType(query["entity-type"]);
    const entityId = parseTaskRunEntityId(query["entity-id"]);
    const hasEntityPair = entityType !== null && entityId !== null;

    return {
      page: parsePage(query.page),
      tab: parseTab(query.tab),
      status: parseOutcome(query.status),
      sort_column: parseSortColumn(
        query.sort_column,
        TASK_RUN_SORT_COLUMNS,
        DEFAULT_SORT_COLUMN,
      ),
      sort_direction: parseSortDirection(
        query.sort_direction,
        DEFAULT_SORT_DIRECTION,
      ),
      "run-type": parseTaskRunRunType(query["run-type"]),
      "entity-type": hasEntityPair ? entityType : null,
      "entity-id": hasEntityPair ? entityId : null,
      "started-at": parseTaskRunStartedAt(query["started-at"]),
      "include-today": parseIncludeToday(query["include-today"]),
    };
  },
  serialize: ({
    page,
    tab,
    status,
    sort_column,
    sort_direction,
    "run-type": runType,
    "entity-type": entityType,
    "entity-id": entityId,
    "started-at": startedAt,
    "include-today": includeToday,
  }) => ({
    page: page === 0 ? undefined : String(page),
    tab: tab === "tasks" ? undefined : tab,
    status: status === null ? undefined : status,
    sort_column: sort_column === DEFAULT_SORT_COLUMN ? undefined : sort_column,
    sort_direction:
      sort_direction === DEFAULT_SORT_DIRECTION ? undefined : sort_direction,
    "run-type": runType === null ? undefined : runType,
    "entity-type": entityType === null ? undefined : entityType,
    "entity-id": entityId === null ? undefined : String(entityId),
    "started-at": startedAt === null ? undefined : startedAt,
    "include-today": includeToday ? "true" : undefined,
  }),
};

const parseTab = (param: QueryParam): TaskRunsTab =>
  getFirstParamValue(param) === "scheduled" ? "scheduled" : "tasks";

const parseOutcome = (param: QueryParam): TaskRunOutcome | null => {
  const value = getFirstParamValue(param);
  return value === "success" || value === "failed" ? value : null;
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

const parseTaskRunStartedAt = (param: QueryParam): UrlState["started-at"] => {
  const value = getFirstParamValue(param);
  return value && guardTaskRunStartedAtRange(value) ? value : null;
};

const parseIncludeToday = (param: QueryParam): UrlState["include-today"] => {
  return getFirstParamValue(param) === "true";
};
