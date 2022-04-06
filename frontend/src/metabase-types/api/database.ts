export type DatabaseId = number;

export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export type DatabaseNativePermission = "read" | "write" | "none";

export interface Database {
  id: DatabaseId;
  name: string;
  engine: string;
  is_sample: boolean;
  is_full_sync: boolean;
  is_on_demand: boolean;
  auto_run_queries: boolean;
  is_saved_questions?: boolean;
  features: string[];
  native_permissions: DatabaseNativePermission;
  cache_ttl: number | null;
  caveats: string | null;
  description: string | null;
  creator_id?: number;
  created_at: string;
  updated_at: string;
  timezone?: string;
  initial_sync_status: InitialSyncStatus;
}
