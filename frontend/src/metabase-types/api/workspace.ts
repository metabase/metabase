import type { CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type { TransformId } from "./transform";

export type WorkspaceId = number;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  collection_id: CollectionId | null;
  database_id: DatabaseId | null;
  created_at: string;
  updated_at: string;
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
  id: TransformId;
  name: string;
};

export type WorkspaceContents = {
  contents: {
    transforms: WorkspaceTransformItem[];
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
