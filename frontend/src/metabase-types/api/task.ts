import type { DatabaseId } from "./database";
import type { PaginationRequest, PaginationResponse } from "./pagination";

export interface Task {
  id: number;
  db_id: DatabaseId | null;
  duration: number;
  started_at: string;
  ended_at: string;
  task: string;
  task_details: Record<string, unknown> | null;
  // "unknown" status is only expected for historical tasks before `status` is introduced
  status: "success" | "started" | "failed" | "unknown";
}
export type ListTasksRequest = PaginationRequest;

export type ListTasksResponse = { data: Task[] } & PaginationResponse;

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
