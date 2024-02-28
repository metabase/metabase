import type { ScheduleSettings } from "./settings";
import type { Table } from "./table";

import type { ISO8601Time } from ".";

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
  | "dynamic-schema"
  | "expression-aggregations"
  | "expressions"
  | "foreign-keys"
  | "native-parameters"
  | "nested-queries"
  | "standard-deviation-aggregations"
  | "percentile-aggregations"
  | "persist-models"
  | "persist-models-enabled"
  | "schemas"
  | "set-timezone"
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join"
  | "nested-field-columns"
  | "advanced-math-expressions"
  | "connection-impersonation"
  | "connection-impersonation-requires-role";

export interface Database extends DatabaseData {
  id: DatabaseId;
  is_saved_questions: boolean;
  features: DatabaseFeature[];
  creator_id?: number;
  timezone?: string;
  native_permissions: "write" | "none";
  initial_sync_status: InitialSyncStatus;
  caveats?: string;
  points_of_interest?: string;
  created_at: ISO8601Time;
  updated_at: ISO8601Time;
  can_upload: boolean;

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
  settings?: DatabaseSettings | null;
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

export interface DatabaseQuery {
  include?: "tables" | "tables.fields";
  include_editable_data_model?: boolean;
  exclude_uneditable_details?: boolean;
}

export interface DatabaseListQuery {
  include?: "tables";
  saved?: boolean;
  include_editable_data_model?: boolean;
  exclude_uneditable_details?: boolean;
}

export interface DatabaseIdFieldListQuery {
  include_editable_data_model?: boolean;
}

export interface SavedQuestionDatabase {
  id: -1337;
  name: "Saved Questions";
  is_saved_questions: true;
}

export interface CacheConfigListQuery {}
