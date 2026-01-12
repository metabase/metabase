import type { CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type {
  Transform,
  TransformId,
  TransformSource,
  TransformTagId,
  TransformTarget,
} from "./transform";

export type WorkspaceId = number;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  status: WorkspaceSetupStatus;
  collection_id?: CollectionId | null;
  database_id?: DatabaseId | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkspaceItem = {
  id: WorkspaceId;
  name: string;
  database_id: DatabaseId;
  status: WorkspaceSetupStatus;
  updated_at?: string;
};

export type WorkspaceListResponse = {
  items: WorkspaceItem[];
  limit: number | null;
  offset: number | null;
};

export type CreateWorkspaceRequest = {
  name?: string;
  database_id?: DatabaseId;
};

export type WorkspaceTransformItem = {
  ref_id: string;
  global_id: TransformId | null;
  name: string;
  source_type: Transform["source_type"] | null;
};

export type WorkspaceTransformsResponse = {
  transforms: WorkspaceTransformItem[];
};

export type ExternalTransform = {
  id: TransformId;
  name: string;
  source_type: Transform["source_type"];
  checkout_disabled: string | null;
};

export type ExternalTransformsRequest = {
  workspaceId: WorkspaceId;
  databaseId?: DatabaseId | null;
};

export type ExternalTransformsResponse = {
  transforms: ExternalTransform[];
};

export type WorkspaceOutputTableRef = {
  transform_id: number | string | null;
  schema: string;
  table: string;
  table_id: number | null;
};

export type WorkspaceTransform = Omit<Transform, "id"> & {
  // Local identifier used by the UI; equal to `ref_id`
  id: string;
  ref_id: string;
  workspace_id: WorkspaceId;
  global_id: TransformId | null;
  target_stale: boolean;
  archived_at: string | null;
  last_run_at: string | null;
  last_run_message: string | null;
};

export type WorkspaceCheckoutItem = {
  id: string;
  name: string;
  workspace: WorkspaceItem;
};

export type WorkspaceCheckoutResponse = {
  transforms: WorkspaceCheckoutItem[];
};

export type WorkspaceMergeTransformResult = {
  op: "create" | "delete" | "update" | "noop";
  global_id: TransformId | null;
  ref_id: string;
  message?: string;
};

export type WorkspaceMergeResponse = {
  merged?: WorkspaceMergeTransformResult[];
  errors?: WorkspaceMergeTransformResult[];
  workspace: WorkspaceItem;
};

export type WorkspaceTransformMergeResponse = WorkspaceMergeTransformResult;

export type ValidateTableNameRequest = {
  id: WorkspaceId;
  db_id: DatabaseId;
  target: {
    type: "table";
    name: string;
    schema: string | null;
  };
};

export type ValidateTableNameResponse =
  | "OK"
  | "A table with that name already exists";

export type CreateWorkspaceTransformRequest = {
  global_id?: TransformId;
  name: string;
  description?: string | null;
  source: TransformSource;
  target: TransformTarget;
  tag_ids?: TransformTagId[];
};

export type UpdateWorkspaceTransformRequest = {
  workspaceId: WorkspaceId;
  transformId: string;
  name?: string;
  description?: string | null;
  source?: TransformSource;
  target?: TransformTarget;
  tag_ids?: TransformTagId[];
};

export type WorkspaceTransformRef = {
  workspaceId: WorkspaceId;
  transformId: string;
};

export type CreateWorkspaceTransformResponse = WorkspaceTransform;

export type WorkspaceInputTable = {
  db_id: DatabaseId;
  schema: string;
  table_id: number | null;
  table: string;
};

export type WorkspaceOutputTableEntry = {
  transform_id: string;
  schema: string;
  table: string;
  table_id: number | null;
};

export type WorkspaceOutputTable = {
  db_id: DatabaseId;
  global: WorkspaceOutputTableEntry;
  isolated: WorkspaceOutputTableEntry;
};

export type WorkspaceTablesResponse = {
  inputs: WorkspaceInputTable[];
  outputs: WorkspaceOutputTable[];
};

// Graph types for React Flow dependency diagram
export type WorkspaceGraphNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
};

export type WorkspaceGraphEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
};

export type WorkspaceGraphResponse = {
  nodes: WorkspaceGraphNode[];
  edges: WorkspaceGraphEdge[];
};

// Problem types for workspace validation
export type WorkspaceEntityRef =
  | { "entity-type": "workspace-transform"; "entity-id": string }
  | { "entity-type": "global-transform"; "entity-id": number };

export type WorkspaceTableRef = {
  db_id: DatabaseId;
  schema: string;
  table: string;
};

export type WorkspaceProblemCategory =
  | "unused"
  | "internal-downstream"
  | "external-downstream"
  | "internal"
  | "external";

export type WorkspaceProblemType =
  | "not-run"
  | "stale"
  | "failed"
  | "removed-field"
  | "removed-table"
  | "target-conflict"
  | "cycle";

export type WorkspaceProblemSeverity = "error" | "warning" | "info";

// Base types for problem data structures
export type WorkspaceProblemOutput = {
  db_id: DatabaseId;
  schema: string | null;
  table: string;
};

export type WorkspaceProblemTransformRef = {
  type: "workspace-transform" | "external-transform";
  id: string | number;
  name?: string;
};

export type WorkspaceProblemBadRef = {
  type:
    | "validate/missing-column"
    | "validate/missing-table-alias"
    | "validate/duplicate-column"
    | "validate/syntax-error"
    | "validate/validation-exception-error";
  name?: string; // Column/alias name (for missing-column, missing-table-alias, duplicate-column)
  message?: string; // Error message (for validation-exception-error)
};

// Problem data structures matching backend implementation
// See enterprise/backend/src/metabase_enterprise/workspaces/validation.clj

// unused/not-run: Output hasn't been created, nothing depends on it
export type WorkspaceProblemDataUnusedNotRun = {
  output: WorkspaceProblemOutput;
  transform: WorkspaceProblemTransformRef;
};

// internal-downstream/not-run: Output hasn't been created, other workspace transforms need it
export type WorkspaceProblemDataInternalDownstreamNotRun = {
  output: WorkspaceProblemOutput;
  transform: WorkspaceProblemTransformRef;
  dependents: Array<{
    type: "workspace-transform";
    id: string;
  }>;
};

// external-downstream/not-run: Output hasn't been created, external transforms depend on it
export type WorkspaceProblemDataExternalDownstreamNotRun = {
  output: WorkspaceProblemOutput;
  transform: WorkspaceProblemTransformRef;
  dependents: Array<{
    type: "external-transform";
    id: number;
    name: string;
  }>;
};

// external-downstream/removed-field: Field was removed that external transforms reference
export type WorkspaceProblemDataRemovedField = {
  output: WorkspaceProblemOutput;
  transform: {
    type: "external-transform";
    id: number;
    name: string;
  };
  "bad-refs": WorkspaceProblemBadRef[];
};

export type KnownWorkspaceProblemData =
  | WorkspaceProblemDataUnusedNotRun
  | WorkspaceProblemDataInternalDownstreamNotRun
  | WorkspaceProblemDataExternalDownstreamNotRun
  | WorkspaceProblemDataRemovedField;

export type WorkspaceProblemData =
  | KnownWorkspaceProblemData
  | Record<string, unknown>; // For future problem types not yet implemented

export type WorkspaceProblem = {
  category: WorkspaceProblemCategory;
  problem: WorkspaceProblemType;
  severity: WorkspaceProblemSeverity;
  block_merge: boolean;
  description: string;
  data: WorkspaceProblemData;
};

export type WorkspaceLogEntryId = number;

// Status used in workspace log responses (different from archived boolean on Workspace)
export type WorkspaceSetupStatus =
  | "pending"
  | "ready"
  | "archived"
  | "uninitialized"
  | "broken";

export type WorkspaceLogStatus = "started" | "success" | "failure";

export type WorkspaceLogResponse = {
  workspace_id: WorkspaceId;
  status: WorkspaceSetupStatus;
  updated_at: string | null;
  last_completed_at: string | null;
  logs: WorkspaceLogEntry[];
};

export type WorkspaceTask =
  | "workspace-setup"
  | "database-isolation"
  | "mirror-entities"
  | "grant-read-access";

export type WorkspaceLogEntry = {
  id: WorkspaceLogEntryId;
  task: WorkspaceTask | string;
  description: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  status: WorkspaceLogStatus | null;
  message: string | null;
};

export type WorkspaceRunRequest = {
  id: WorkspaceId;
  stale_only?: boolean;
};

export type WorkspaceRunResponse = {
  succeeded: TransformId[];
  failed: TransformId[];
  not_run: TransformId[];
};

export type WorkspaceTransformRunResponse = {
  status: "succeeded" | "failed";
  start_time?: string | null;
  end_time?: string | null;
  message?: string | null;
  table: {
    name: string;
    schema?: string | null;
  };
};

export type WorkspaceAllowedDatabase = {
  id: number;
  name: string;
  supported: boolean;
  reason?: string;
};

export type WorkspaceAllowedDatabasesResponse = {
  databases: WorkspaceAllowedDatabase[];
};
