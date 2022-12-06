import { NativePermissions } from "./permissions";
import { ScheduleSettings } from "./settings";

export type DatabaseId = number;

export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export type DatabaseSettings = {
  [key: string]: any;
};

export interface Database {
  id: DatabaseId;
  name: string;
  engine: string;
  is_sample: boolean;
  is_saved_questions: boolean;
  creator_id?: number;
  created_at: string;
  timezone?: string;
  native_permissions: NativePermissions;
  initial_sync_status: InitialSyncStatus;

  settings?: DatabaseSettings | null;

  // Only appears in  GET /api/database/:id
  "can-manage"?: boolean;
}

export interface DatabaseSchedules {
  metadata_sync?: ScheduleSettings;
  cache_field_values?: ScheduleSettings;
}
