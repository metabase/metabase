import type { DatabaseId } from "./database";
import type { TableId } from "./table";

export type WorkspaceInstanceDatabase = {
  name: string;
  input_schemas: string[];
  output_schema: string;
};

export type WorkspaceInstance = {
  name: string;
  databases: Record<DatabaseId, WorkspaceInstanceDatabase>;
  remappings_count: number;
};

export type TableRemappingId = number;

export type TableRemapping = {
  id: TableRemappingId;
  database_id: DatabaseId;
  from_schema: string;
  from_table_name: string;
  from_table_id: TableId | null;
  to_schema: string;
  to_table_name: string;
  to_table_id: TableId | null;
  created_at: string;
};

export type WorkspaceTableDriftStatus = "new" | "modified" | "deleted";

export type WorkspaceTransformRunStatus =
  | "succeeded"
  | "failed"
  | "running"
  | "never_run";

export type WorkspaceSchemaDriftColumnTypeChange = {
  name: string;
  from_type: string;
  to_type: string;
};

export type WorkspaceSchemaDrift = {
  added_columns: string[];
  removed_columns: string[];
  type_changed_columns: WorkspaceSchemaDriftColumnTypeChange[];
};

export type WorkspaceDependentEntityType =
  | "question"
  | "model"
  | "metric"
  | "segment"
  | "measure"
  | "transform";

export type WorkspaceDependent = {
  id: number;
  entity_type: WorkspaceDependentEntityType;
  name: string;
};

export type WorkspaceDivergedTable = {
  id: TableRemappingId;
  database_id: DatabaseId;
  table_id: TableId | null;
  schema: string;
  table_name: string;
  status: WorkspaceTableDriftStatus;
  produced_by_transform_id: number | null;
  produced_by_transform_name: string | null;
  last_run_at: string | null;
  last_run_status: WorkspaceTransformRunStatus;
  schema_drift: WorkspaceSchemaDrift;
  dependents: WorkspaceDependent[];
};

export type WorkspaceChangeSummary = {
  diverged_tables: WorkspaceDivergedTable[];
};
