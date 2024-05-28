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
