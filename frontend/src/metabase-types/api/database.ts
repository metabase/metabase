export type DatabaseId = number;

export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface Database {
  id: DatabaseId;
  name: string;
  engine: string;
  is_sample: boolean;
  creator_id?: number;
  created_at: string;
  timezone?: string;
  initial_sync_status: InitialSyncStatus;
}
