import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type {
  TaskRunEntityType,
  TaskRunStatus,
  TaskRunType,
} from "metabase-types/api";

type UrlState = {
  page: number;
  "run-type": TaskRunType | null;
  "entity-type": TaskRunEntityType | null;
  "entity-id": number | null;
  status: TaskRunStatus | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    "run-type": parseRunType(query["run-type"]),
    "entity-type": parseEntityType(query["entity-type"]),
    "entity-id": parseEntityId(query["entity-id"]),
    status: parseStatus(query.status),
  }),
  serialize: ({
    page,
    "run-type": runType,
    "entity-type": entityType,
    "entity-id": entityId,
    status,
  }) => ({
    page: page === 0 ? undefined : String(page),
    "run-type": runType === null ? undefined : runType,
    "entity-type": entityType === null ? undefined : entityType,
    "entity-id": entityId === null ? undefined : String(entityId),
    status: status === null ? undefined : status,
  }),
};

const parsePage = (param: QueryParam): UrlState["page"] => {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const parseRunType = (param: QueryParam): UrlState["run-type"] => {
  const value = getFirstParamValue(param);
  return value && isRunType(value) ? value : null;
};

const isRunType = (value: string): value is TaskRunType => {
  return ["subscription", "alert", "sync", "fingerprint"].includes(value);
};

const parseEntityType = (param: QueryParam): UrlState["entity-type"] => {
  const value = getFirstParamValue(param);
  return value && isEntityType(value) ? value : null;
};

const isEntityType = (value: string): value is TaskRunEntityType => {
  return ["database", "card", "dashboard"].includes(value);
};

const parseEntityId = (param: QueryParam): UrlState["entity-id"] => {
  const value = getFirstParamValue(param);
  if (!value) {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStatus = (param: QueryParam): UrlState["status"] => {
  const value = getFirstParamValue(param);
  return value && isTaskRunStatus(value) ? value : null;
};

const isTaskRunStatus = (value: string): value is TaskRunStatus => {
  return ["started", "success", "failed"].includes(value);
};
