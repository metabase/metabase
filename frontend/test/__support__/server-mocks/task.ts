import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  ListTaskRunsResponse,
  ListTasksResponse,
  Task,
  TaskCountsResponse,
  TaskInfo,
  TaskRunExtended,
} from "metabase-types/api";

export function setupTaskCountsEndpoint(
  response: TaskCountsResponse = { tasks: 0, runs: 0 },
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/task/counts", response, options);
}

export function setupTaskCountsErrorEndpoint() {
  fetchMock.get("path:/api/task/counts", { status: 500 });
}

export function setupTasksEndpoints(
  response: ListTasksResponse,
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/task", response, options);
  response.data.forEach((task) => setupTaskEndpoint(task));
}

export function setupTaskEndpoint(task: Task, options?: UserRouteConfig) {
  fetchMock.get(`path:/api/task/${task.id}`, task, options);
}

export function setupUniqueTasksEndpoint(
  tasks: string[],
  options?: UserRouteConfig,
) {
  fetchMock.get(`path:/api/task/unique-tasks`, tasks, options);
}

export function setupTasksInfoEndpoint(
  taskInfo: TaskInfo,
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/task/info", taskInfo, options);
}

export function setupTaskRunsEndpoints(
  response: ListTaskRunsResponse,
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/task/runs", response, options);
  fetchMock.get("path:/api/task/runs/entities", []);
}

export function setupTaskRunEndpoint(
  taskRun: TaskRunExtended,
  options?: UserRouteConfig,
) {
  fetchMock.get(`path:/api/task/runs/${taskRun.id}`, taskRun, options);
}
