import fetchMock, { type MockOptionsMethodGet } from "fetch-mock";

import type { Task } from "metabase-types/api";

export function setupTasksEndpoints(
  tasks: Task[],
  options?: MockOptionsMethodGet,
) {
  fetchMock.get(
    "path:/api/task",
    { data: tasks, limit: 0, offset: 0, total: 0 },
    options,
  );
  tasks.forEach((task) => setupTaskEndpoint(task));
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
