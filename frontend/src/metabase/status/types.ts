export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface User {
  id: number;
}

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  creator_id?: number;
  initial_sync_status: InitialSyncStatus;
}
