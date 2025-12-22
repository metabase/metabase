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
  archived?: boolean;
  archived_at?: string | null;
  status?: WorkspaceSetupStatus;
  collection_id?: CollectionId | null;
  database_id?: DatabaseId | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkspaceItem = {
  id: WorkspaceId;
  name: string;
  database_id: DatabaseId;
  archived?: boolean;
};

export type CreateWorkspaceRequest = {
  name: string;
  database_id?: DatabaseId;
};

export type WorkspaceListResponse = {
  items: WorkspaceItem[];
  limit: number | null;
  offset: number | null;
};

export type WorkspaceTransformItem = {
  ref_id: string;
  name: string;
  source_type: string;
  stale: boolean;
  global_id: TransformId | null;
  target_stale: boolean;
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
  id: string;
  ref_id: string;
  workspace_id: number;
  stale: boolean;
  global_id: TransformId | null;
  target_stale: boolean;
  target_isolated: WorkspaceOutputTableRef;
  last_run_at: string | null;
};

export type TransformUpstreamMapping = {
  transform: WorkspaceTransformItem | null;
};

export type DownstreamTransformInfo = {
  id: TransformId;
  name: string;
  workspace: WorkspaceItem;
};

export type TransformDownstreamMapping = {
  transforms: DownstreamTransformInfo[];
};

export type WorkspaceCheckoutItem = {
  id: string;
  name: string;
  workspace: WorkspaceItem;
};

export type WorkspaceCheckoutResponse = {
  transforms: WorkspaceCheckoutItem[];
};

export type WorkspaceMergeResponse = {
  promoted: WorkspaceTransformItem[];
  errors?: (WorkspaceTransformItem & { error: string })[];
  workspace: WorkspaceItem;
  archived_at: string | null;
};

export type WorkspaceTransformMergeResponse = {
  // I have no idea atm how are we going to use this
  workspace: WorkspaceItem;
  archived_at: string | null;
};

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

export type WorkspaceProblemMissingInputTable = {
  type: "missing-input-table";
  data: {
    "entity-type": "workspace-transform";
    "entity-id": string;
    table: WorkspaceTableRef;
  };
};

export type WorkspaceProblemTargetConflict = {
  type: "target-conflict";
  data: {
    table: WorkspaceTableRef;
    entities: WorkspaceEntityRef[];
  };
};

export type WorkspaceProblemCycle = {
  type: "cycle";
  data: {
    path: WorkspaceEntityRef[];
  };
};

export type WorkspaceProblem =
  | WorkspaceProblemMissingInputTable
  | WorkspaceProblemTargetConflict
  | WorkspaceProblemCycle;

export type WorkspaceLogEntryId = number;

// Status used in workspace log responses (different from archived boolean on Workspace)
export type WorkspaceSetupStatus = "pending" | "ready" | "archived";

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
