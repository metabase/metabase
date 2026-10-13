import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  ListTaskRunsResponse,
  ListTasksResponse,
  Task,
  TaskCountsResponse,
  TaskInfo,
  TaskRunExtended,
} from "metabase-types/api";

/** Mock the default task populations independently of list filters. */
export function setupTaskCountsEndpoint(
  response: TaskCountsResponse = { tasks: 0, runs: 0 },
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/task/counts", response, options);
}

/** Mock a failed task count request without failing the list endpoint. */
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
