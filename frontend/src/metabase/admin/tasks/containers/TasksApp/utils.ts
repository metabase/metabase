import type {
  QueryParam,
  UrlStateConfig,
} from "metabase/common/hooks/use-url-state";
import type { TaskStatus } from "metabase-types/api";

type UrlState = {
  page: number;
  task: string | null;
  status: TaskStatus | null;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    task: parseTask(query.task),
    status: parseStatus(query.status),
  }),
  serialize: ({ page, task, status }) => ({
    page: page === 0 ? undefined : String(page),
    task: task === null ? undefined : task,
    status: status === null ? undefined : status,
  }),
};

function parsePage(param: QueryParam): UrlState["page"] {
  const value = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseTask(param: QueryParam): UrlState["task"] {
  const value = Array.isArray(param) ? param[0] : param;
  return value && value.trim().length > 0 ? value.trim() : null;
}

function parseStatus(param: QueryParam): UrlState["status"] {
  const value = Array.isArray(param) ? param[0] : param;
  return value && isTaskStatus(value) ? value : null;
}

function isTaskStatus(value: string): value is TaskStatus {
  return ["success", "started", "failed", "unknown"].includes(value);
}
