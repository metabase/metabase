import type { Log } from "metabase-types/api/util";

import type { DatabaseId } from "./database";
import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { SortingOptions } from "./sorting";

// "unknown" status is only expected for historical tasks (before Task['status'] was introduced)
export type TaskStatus = "success" | "started" | "failed" | "unknown";

export interface Task {
  id: number;
  db_id: DatabaseId | null;
  duration: number | null;
  started_at: string;
  ended_at: string | null;
  task: string;
  task_details: Record<string, unknown> | null;
  status: TaskStatus;
  logs: Log[] | null;
  run_id: number | null;
}

export type ListTasksSortColumn = "started_at" | "ended_at" | "duration";

export type ListTasksRequest = {
  status?: TaskStatus;
  task?: string;
} & PaginationRequest &
  Partial<SortingOptions<ListTasksSortColumn>>;

export type ListTasksResponse = {
  data: Task[];
} & PaginationResponse;

type Trigger = {
  description: string | null;
  schedule: string;
  timezone: string;
  key: string;
  "previous-fire-time": string | null;
  "start-time": string;
  "misfire-instruction": string;
  "end-time": string | null;
  state: string;
  priority: number;
  "next-fire-time": string;
  "may-fire-again?": boolean;
  "final-fire-time": string | null;
  data: Record<string, unknown>;
};

type Job = {
  key: string;
  class: string;
  description: string;
  "concurrent-execution-disallowed?": boolean;
  "durable?": boolean;
  "requests-recovery?": boolean;
  triggers: Trigger[];
};

export type TaskInfo = {
  scheduler: string[];
  jobs: Job[];
};

export type TaskRunType = "subscription" | "alert" | "sync" | "fingerprint";
export type TaskRunEntityType = "database" | "card" | "dashboard";
export type TaskRunStatus = "started" | "success" | "failed" | "abandoned";
export type TaskRunDateFilterOption =
  | "thisday"
  | "past1days~"
  | "past1weeks~"
  | "past7days~"
  | "past30days~"
  | "past1months~"
  | "past3months~"
  | "past12months~";

export interface TaskRun {
  id: number;
  run_type: TaskRunType;
  entity_type: TaskRunEntityType;
  entity_id: number;
  started_at: string;
  ended_at: string | null;
  status: TaskRunStatus;
  entity_name?: string;
  task_count: number;
  success_count: number;
  failed_count: number;
}

export interface TaskRunExtended extends TaskRun {
  tasks: Task[];
}

export interface RunEntity {
  entity_type: TaskRunEntityType;
  entity_id: number;
  entity_name?: string;
}

export type ListTaskRunsRequest = {
  "run-type"?: TaskRunType;
  "entity-type"?: TaskRunEntityType;
  "entity-id"?: number;
  status?: TaskRunStatus;
  "started-at"?: TaskRunDateFilterOption;
} & PaginationRequest;

export type ListTaskRunsResponse = {
  data: TaskRun[];
} & PaginationResponse;

export type ListTaskRunEntitiesRequest = {
  "run-type": TaskRunType;
  "started-at": TaskRunDateFilterOption;
};
