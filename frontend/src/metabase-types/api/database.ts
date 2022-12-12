import { NativePermissions } from "./permissions";
import { ScheduleSettings } from "./settings";

export type DatabaseId = number;

export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export type DatabaseSettings = {
  [key: string]: any;
};

export interface Database extends DatabaseData {
  id: DatabaseId;
  is_saved_questions: boolean;
  creator_id?: number;
  created_at: string;
  timezone?: string;
  native_permissions: NativePermissions;
  initial_sync_status: InitialSyncStatus;

  // appears in frontend/src/metabase/writeback/utils.ts
  settings?: DatabaseSettings | null;

  // Only appears in  GET /api/database/:id
  "can-manage"?: boolean;
}

export interface DatabaseData {
  id?: DatabaseId;
  name: string;
  engine: string | undefined;
  details: Record<string, unknown>;
  schedules: DatabaseSchedules;
  auto_run_queries: boolean | null;
  refingerprint: boolean | null;
  cache_ttl: number | null;
  is_sample: boolean;
  is_full_sync: boolean;
  is_on_demand: boolean;
}

export interface DatabaseSchedules {
  metadata_sync?: ScheduleSettings;
  cache_field_values?: ScheduleSettings;
}
