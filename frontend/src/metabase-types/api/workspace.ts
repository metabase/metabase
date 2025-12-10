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
  collection_id: CollectionId | null;
  database_id: DatabaseId | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  contents?: WorkspaceContents["contents"];
};

export type WorkspaceItem = {
  id: WorkspaceId;
  name: string;
};

export type CreateWorkspaceRequest = {
  name: string;
  database_id?: DatabaseId;
  upstream: {
    transforms?: TransformId[];
  };
};

export type WorkspaceListResponse = {
  items: Workspace[];
};

export type WorkspaceContentItem = WorkspaceTransformItem;

export type WorkspaceTransformItem = {
  type: "transform";
  id: TransformId;
  name: string;
  upstream_id: TransformId;
  workspace_id: WorkspaceId;
};

export type WorkspaceContents = {
  contents: {
    transforms: Transform[];
  };
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

export type WorkspaceMergeResponse = {
  promoted: WorkspaceContentItem[];
  errors?: (WorkspaceContentItem & { error: string })[];
  workspace: WorkspaceItem;
  archived_at: string | null;
};

export type WorkspaceUpdateContentsRequest = {
  id: WorkspaceId;
  add?: {
    transforms?: TransformId[];
  };
  remove?: {
    transforms?: TransformId[];
  };
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
  name: string;
  description?: string | null;
  source: TransformSource;
  target: TransformTarget;
  tag_ids?: TransformTagId[];
};

export type CreateWorkspaceTransformResponse = Transform;

export type WorkspaceTable = {
  id?: number;
  schema: string | null;
  table: string | null;
};

export type WorkspaceOutputTable = {
  global?: WorkspaceTable;
  workspace?: {
    "transform-id": number;
    "table-id": number;
    schema: string | null;
    table: string | null;
  };
};

export type WorkspaceTablesResponse = {
  inputs: WorkspaceTable[];
  outputs: WorkspaceOutputTable[];
};

export type WorkspaceLogEntryId = number;

export type WorkspaceStatus = "pending" | "ready";

export type WorkspaceLogStatus = "started" | "success" | "failure";

export type WorkspaceLogResponse = {
  workspace_id: WorkspaceId;
  status: WorkspaceStatus;
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
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  status: WorkspaceLogStatus | null;
  message: string | null;
};

export type WorkspaceExecuteRequest = {
  id: WorkspaceId;
  stale_only?: boolean;
};

export type WorkspaceExecuteResponse = {
  succeeded: TransformId[];
  failed: TransformId[];
  not_run: TransformId[];
};
