import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type {
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

type UrlState = {
  page: number;
  "run-type": TaskRunType | null;
  "entity-type": TaskRunEntityType | null;
  "entity-id": number | null;
  status: TaskRunStatus | null;
  "started-at": TaskRunDateFilterOption | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    "run-type": parseTaskRunRunType(query["run-type"]),
    "entity-type": parseTaskRunEntityType(query["entity-type"]),
    "entity-id": parseTaskRunEntityId(query["entity-id"]),
    status: parseTaskRunStatus(query.status),
    "started-at": parseTaskRunStartedAt(query["started-at"]),
  }),
  serialize: ({
    page,
    "run-type": runType,
    "entity-type": entityType,
    "entity-id": entityId,
    status,
    "started-at": startedAt,
  }) => ({
    page: page === 0 ? undefined : String(page),
    "run-type": runType === null ? undefined : runType,
    "entity-type": entityType === null ? undefined : entityType,
    "entity-id": entityId === null ? undefined : String(entityId),
    status: status === null ? undefined : status,
    "started-at": startedAt === null ? undefined : startedAt,
  }),
};

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
