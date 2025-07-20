import fetchMock, { type MockOptionsMethodGet } from "fetch-mock";

import type { ListTasksResponse, Task } from "metabase-types/api";

export function setupTasksEndpoints(
  response: ListTasksResponse,
  options?: MockOptionsMethodGet,
) {
  fetchMock.get("path:/api/task", response, options);
  response.data.forEach((task) => setupTaskEndpoint(task));
}

export function setupTaskEndpoint(task: Task, options?: MockOptionsMethodGet) {
  fetchMock.get(`path:/api/task/${task.id}`, task, options);
}

export function setupUniqueTasksEndpoint(
  tasks: string[],
  options?: MockOptionsMethodGet,
) {
  fetchMock.get(`path:/api/task/unique-tasks`, tasks, options);
}
