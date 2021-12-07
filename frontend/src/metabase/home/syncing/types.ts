type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  creator_id?: number;
  initial_sync_status: InitialSyncStatus;
  tables: Table[];
}

export interface Table {
  id: number;
  initial_sync_status: InitialSyncStatus;
}
