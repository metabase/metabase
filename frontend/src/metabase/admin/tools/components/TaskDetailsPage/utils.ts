import type { Task } from "metabase-types/api";

export const getFilename = (task: Task | undefined) =>
  task ? `task-${task.id}.json` : "task.json";

export const formatTaskDetails = (task: Task | undefined): string =>
  task ? JSON.stringify(task.task_details, null, 2) : "";
