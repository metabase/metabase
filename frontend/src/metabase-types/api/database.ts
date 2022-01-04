export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export interface Database {
  id: number;
  name: string;
  is_sample: boolean;
  creator_id?: number;
  initial_sync_status: InitialSyncStatus;
}

export const createDatabase = (opts?: Partial<Database>): Database => ({
  id: 1,
  name: "Database",
  is_sample: false,
  creator_id: undefined,
  initial_sync_status: "complete",
  ...opts,
});
