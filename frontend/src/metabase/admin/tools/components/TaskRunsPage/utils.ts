import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { TaskRunStatus, TaskRunType } from "metabase-types/api";

type UrlState = {
  page: number;
  "run-type": TaskRunType | null;
  status: TaskRunStatus | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    "run-type": parseRunType(query["run-type"]),
    status: parseStatus(query.status),
  }),
  serialize: ({ page, "run-type": runType, status }) => ({
    page: page === 0 ? undefined : String(page),
    "run-type": runType === null ? undefined : runType,
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

const parseStatus = (param: QueryParam): UrlState["status"] => {
  const value = getFirstParamValue(param);
  return value && isTaskRunStatus(value) ? value : null;
};

const isTaskRunStatus = (value: string): value is TaskRunStatus => {
  return ["started", "success", "failed"].includes(value);
};
