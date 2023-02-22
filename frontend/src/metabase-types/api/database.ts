import { NativePermissions } from "./permissions";
import { ScheduleSettings } from "./settings";
import { Table } from "./table";
import { ISO8601Time } from ".";

export type DatabaseId = number;

export type InitialSyncStatus = "incomplete" | "complete" | "aborted";

export type DatabaseSettings = {
  [key: string]: any;
  "database-enable-actions"?: boolean;
};

export type DatabaseFeature =
  | "actions"
  | "basic-aggregations"
  | "binning"
  | "case-sensitivity-string-filter-options"
  | "expression-aggregations"
  | "expressions"
  | "foreign-keys"
  | "native-parameters"
  | "nested-queries"
  | "standard-deviation-aggregations"
  | "persist-models"
  | "persist-models-enabled"
  | "set-timezone";

export interface Database extends DatabaseData {
  id: DatabaseId;
  is_saved_questions: boolean;
  features: DatabaseFeature[];
  creator_id?: number;
  timezone?: string;
  native_permissions: NativePermissions;
  initial_sync_status: InitialSyncStatus;

  settings?: DatabaseSettings | null;

  created_at: ISO8601Time;
  updated_at: ISO8601Time;

  // Only appears in  GET /api/database/:id
  "can-manage"?: boolean;
  tables?: Table[];
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

export interface DatabaseUsageInfo {
  question: number;
  dataset: number;
  metric: number;
  segment: number;
}
