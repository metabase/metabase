import type { ScheduleSettings } from "./settings";
import type { Table } from "./table";

import type { ISO8601Time, LongTaskStatus } from ".";

export type DatabaseId = number;

export type InitialSyncStatus = LongTaskStatus;

export type DatabaseSettings = {
  [key: string]: any;
  "database-enable-actions"?: boolean;
};

export type DatabaseFeature =
  | "actions"
  | "actions/data-editing"
  | "basic-aggregations"
  | "binning"
  | "case-sensitivity-string-filter-options"
  | "convert-timezone"
  | "datetime-diff"
  | "database-replication"
  | "database-routing"
  | "dynamic-schema"
  | "expression-aggregations"
  | "expression-literals"
  | "expressions"
  | "expressions/date"
  | "expressions/datetime"
  | "expressions/integer"
  | "expressions/float"
  | "expressions/text"
  | "expressions/today"
  | "native-parameters"
  | "nested-queries"
  | "standard-deviation-aggregations"
  | "percentile-aggregations"
  | "persist-models"
  | "persist-models-enabled"
  | "regex"
  | "regex/lookaheads-and-lookbehinds"
  | "schemas"
  | "set-timezone"
  | "left-join"
  | "right-join"
  | "inner-join"
  | "full-join"
  | "nested-field-columns"
  | "advanced-math-expressions"
  | "connection-impersonation"
  | "connection-impersonation-requires-role"
  | "native-requires-specified-collection"
  | "window-functions/offset"
  | "distinct-where"
  | "saved-question-sandboxing"
  | "split-part"
  | "collate"
  | "transforms/python"
  | "transforms/table";

export interface Database extends DatabaseData {
  id: DatabaseId;
  is_saved_questions: boolean;
  features?: DatabaseFeature[];
  creator_id?: number;
  timezone?: string;
  native_permissions: "write" | "none";
  transforms_permissions?: "write" | "none";
  initial_sync_status: InitialSyncStatus;
  caveats?: string;
  points_of_interest?: string;
  created_at: ISO8601Time;
  updated_at: ISO8601Time;
  can_upload: boolean;
  uploads_enabled: boolean;
  uploads_schema_name: string | null;
  uploads_table_prefix: string | null;
  is_audit?: boolean;
  is_attached_dwh?: boolean;
  router_database_id?: number | null;
  router_user_attribute?: string | null;

  // Only appears in  GET /api/database/:id
  "can-manage"?: boolean;
  tables?: Table[];
}

export interface DatabaseData {
  id?: DatabaseId;
  name: string;
  engine: string | undefined;
  // If current user lacks write permission to database, `details` will be
  // missing in responses from the backend, cf. implementation of
  // [[metabase.models.interface/to-json]] for `:model/Database`:
  details?: Record<string, unknown>;
  write_data_details?: Record<string, unknown> | null;
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
  cache_field_values?: ScheduleSettings | null;
}

export interface DatabaseUsageInfo {
  question: number;
  dataset: number;
  metric: number;
  segment: number;
}

export interface GetDatabaseRequest {
  id: DatabaseId;
  include?: "tables" | "tables.fields";
  include_editable_data_model?: boolean;
  exclude_uneditable_details?: boolean;
}

export interface GetDatabaseSettingsAvailableResponse {
  settings: Record<string, DatabaseLocalSettingAvailability>;
}

export type DatabaseLocalSettingDisableReason = {
  key: string;
  message: string;
};

export type DatabaseLocalSettingAvailability =
  | { enabled: true }
  | { enabled: false; reasons: DatabaseLocalSettingDisableReason[] };

export type DatabaseConnectionType = "default" | "write-data";

export type GetDatabaseHealthRequest = {
  id: DatabaseId;
  connection_type?: DatabaseConnectionType;
};

export type GetDatabaseHealthResponse =
  | { status: "ok" }
  | { status: "error"; message: string; errors: unknown };

export interface ListDatabasesRequest {
  include?: "tables";
  saved?: boolean;
  include_editable_data_model?: boolean;
  exclude_uneditable_details?: boolean;
  include_only_uploadable?: boolean;
  include_analytics?: boolean;
  router_database_id?: DatabaseId;
  "can-query"?: boolean;
  "can-write-metadata"?: boolean;
}

export interface ListDatabasesResponse {
  data: Database[];
  total: number;
}

export interface ListDatabaseIdFieldsRequest {
  id: DatabaseId;
  include_editable_data_model?: boolean;
}

export interface ListDatabaseSchemasRequest {
  id: DatabaseId;
  include_hidden?: boolean;
  include_editable_data_model?: boolean;
  "can-query"?: boolean;
  "can-write-metadata"?: boolean;
}

export interface ListDatabaseSchemaTablesRequest {
  id: DatabaseId;
  schema: string;
  include_hidden?: boolean;
  include_editable_data_model?: boolean;
  "can-query"?: boolean;
  "can-write-metadata"?: boolean;
}

export interface ListVirtualDatabaseTablesRequest {
  id: DatabaseId;
  schema: string;
}

export interface GetDatabaseMetadataRequest {
  id: DatabaseId;
  include_hidden?: boolean;
  include_editable_data_model?: boolean;
  remove_inactive?: boolean;
  skip_fields?: boolean;
}

export interface CreateDatabaseRequest {
  name: string;
  engine: string;
  details: Record<string, unknown>;
  is_full_sync?: boolean;
  is_on_demand?: boolean;
  schedules?: DatabaseSchedules;
  auto_run_queries?: boolean;
  cache_ttl?: number;
  connection_source?: "admin" | "setup";
}

export interface UpdateDatabaseRequest {
  id: DatabaseId;
  name?: string;
  engine?: string;
  refingerprint?: boolean | null;
  details?: Record<string, unknown>;
  schedules?: DatabaseSchedules;
  description?: string;
  caveats?: string;
  points_of_interest?: string;
  auto_run_queries?: boolean;
  cache_ttl?: number | null;
  settings?: DatabaseSettings | null;
}

export type DatabaseEditErrorType = {
  data: {
    message: string;
    errors: { [key: string]: string };
  };
  statusText: string;
  message: string;
};

export interface DatabaseIdFieldListQuery {
  include_editable_data_model?: boolean;
}

export interface SavedQuestionDatabase {
  id: -1337;
  name: "Saved Questions";
  is_saved_questions: true;
}

export interface CreateDestinationDatabaseRequest {
  router_database_id: DatabaseId;
  destination_database: { name: string; details?: Record<string, unknown> };
}

export interface UpdateDatabaseRouterRequest {
  id: DatabaseId;
  user_attribute: string | null;
}
