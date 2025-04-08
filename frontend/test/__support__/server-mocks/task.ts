import fetchMock from "fetch-mock";

import type { Task } from "metabase-types/api";

export const setupTaskEndpoint = (task: Task) => {
  fetchMock.get(`path:/api/task/${task.id}`, task);
};
