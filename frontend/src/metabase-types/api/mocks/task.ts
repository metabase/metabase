import type { Task, TaskRun, TaskRunExtended } from "metabase-types/api";

export const createMockTask = (task?: Partial<Task>): Task => ({
  id: 1,
  db_id: 1,
  duration: 100,
  started_at: "2023-03-04T01:45:26.005475-08:00",
  ended_at: "2023-03-04T01:45:26.518597-08:00",
  task: "A task",
  task_details: null,
  status: "success",
  logs: task?.logs ?? null,
  run_id: task?.run_id ?? null,
  ...task,
});

export const createMockTaskRun = (taskRun?: Partial<TaskRun>): TaskRun => ({
  id: 1,
  run_type: "sync",
  entity_type: "database",
  entity_id: 1,
  started_at: "2023-03-04T01:45:26.005475-08:00",
  ended_at: "2023-03-04T01:45:26.518597-08:00",
  status: "success",
  entity_name: "Sample Database",
  task_count: 3,
  success_count: 3,
  failed_count: 0,
  ...taskRun,
});

export const createMockTaskRunExtended = (
  taskRunExtended?: Partial<TaskRunExtended>,
): TaskRunExtended => ({
  ...createMockTaskRun(taskRunExtended),
  tasks: taskRunExtended?.tasks ?? [],
});
