import type {
  TaskRunDateFilterOption,
  TaskRunEntityType,
  TaskRunType,
} from "metabase-types/api";

const ROOT_URL = "/monitor";

export function monitor() {
  return ROOT_URL;
}

export function monitorTasks() {
  return `${ROOT_URL}/tasks`;
}

export function monitorTasksList() {
  return `${monitorTasks()}/list`;
}

export function monitorTaskDetails(taskId: number) {
  return `${monitorTasksList()}/${taskId}`;
}

export function monitorTasksRuns() {
  return `${monitorTasks()}/runs`;
}

export function monitorTaskRunDetails(runId: number) {
  return `${monitorTasksRuns()}/${runId}`;
}

export function monitorTasksRunsFor(opts: {
  runType: TaskRunType;
  entityType: TaskRunEntityType;
  entityId?: number;
  startedAt?: TaskRunDateFilterOption;
  includeToday?: boolean;
}) {
  const params: Record<string, string> = {
    "run-type": opts.runType,
    "entity-type": opts.entityType,
  };
  if (opts.entityId) {
    params["entity-id"] = String(opts.entityId);
  }
  if (opts.startedAt) {
    params["started-at"] = opts.startedAt;
  }
  if (opts.includeToday) {
    params["include-today"] = "true";
  }
  return `${monitorTasksRuns()}?${new URLSearchParams(params).toString()}`;
}

export function monitorJobs() {
  return `${ROOT_URL}/jobs`;
}

export function monitorJobTriggers(jobKey: string) {
  return `${monitorJobs()}/${jobKey}`;
}

export function monitorLogs() {
  return `${ROOT_URL}/logs`;
}

export function monitorLogLevels() {
  return `${monitorLogs()}/levels`;
}

export function monitorErroringQuestions() {
  return `${ROOT_URL}/errors`;
}

export function monitorModelCaching() {
  return `${ROOT_URL}/model-caching`;
}

export function monitorModelCacheRefreshJob(jobId: number) {
  return `${monitorModelCaching()}/${jobId}`;
}

export function monitorNotifications() {
  return `${ROOT_URL}/notifications`;
}

export function monitorNotificationDetail(id: number) {
  return `${monitorNotifications()}/${id}`;
}
