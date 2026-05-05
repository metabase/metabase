import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  ListTaskRunsResponse,
  ListTasksResponse,
  Task,
  TaskRunExtended,
} from "metabase-types/api";

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
