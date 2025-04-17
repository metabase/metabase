import fetchMock, { type MockOptionsMethodGet } from "fetch-mock";

import type { Task } from "metabase-types/api";

export function setupTasksEndpoints(
  tasks: Task[],
  options?: MockOptionsMethodGet,
) {
  fetchMock.get("path:/api/task", tasks, options);
  tasks.forEach((task) => setupTaskEndpoint(task));
}

export function setupTaskEndpoint(task: Task, options?: MockOptionsMethodGet) {
  fetchMock.get(`path:/api/task/${task.id}`, task, options);
}
