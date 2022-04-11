export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface Database {
  id: number;
  name: string;
  engine: string;
  is_sample: boolean;
  creator_id?: number;
  created_at: string;
  timezone?: string;
  initial_sync_status: InitialSyncStatus;
}
