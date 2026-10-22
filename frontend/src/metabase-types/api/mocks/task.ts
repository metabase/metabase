import type {
  Job,
  Task,
  TaskInfo,
  TaskRun,
  TaskRunExtended,
  Trigger,
} from "metabase-types/api";

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

export const createMockTrigger = (trigger?: Partial<Trigger>): Trigger => ({
  key: "a-trigger-key",
  description: "A trigger description",
  schedule: "0 0 * * * ?",
  timezone: "UTC",
  "previous-fire-time": "2023-03-04T01:45:00Z",
  "next-fire-time": "2023-03-05T01:45:00Z",
  "start-time": "2023-03-01T00:00:00Z",
  "end-time": null,
  "final-fire-time": null,
  state: "WAITING",
  priority: 5,
  "misfire-instruction": "DO_NOTHING",
  "may-fire-again?": true,
  data: {},
  ...trigger,
});

export const createMockJob = (job?: Partial<Job>): Job => ({
  key: "a-job-key",
  class: "org.quartz.jobs.AJobClass",
  description: "A job description",
  "concurrent-execution-disallowed?": false,
  "durable?": true,
  "requests-recovery?": false,
  triggers: [],
  ...job,
});

export const createMockTaskInfo = (taskInfo?: Partial<TaskInfo>): TaskInfo => ({
  scheduler: ["A scheduler line"],
  jobs: [createMockJob()],
  ...taskInfo,
});
