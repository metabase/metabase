type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  initial_sync_status: InitialSyncStatus;
}
