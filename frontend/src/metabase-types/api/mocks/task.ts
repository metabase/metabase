import type { Task } from "metabase-types/api";

export const createMockTask = (task?: Partial<Task>): Task => ({
  id: 1,
  db_id: 1,
  duration: 100,
  started_at: "2023-03-04T01:45:26.005475-08:00",
  ended_at: "2023-03-04T01:45:26.518597-08:00",
  task: "A task",
  task_details: null,
  status: "success",
  ...task,
});
