import type { TransformId } from "./transform";

export type WorkspaceId = number;

export type Workspace = {
  id: WorkspaceId;
  name: string;
  collection_id: number;
  database_id: number;
  created_at: string;
  updated_at: string;
};

export type CreateWorkspaceRequest = {
  name: string;
  database_id?: number;
  upstream: {
    transforms?: TransformId[];
  };
};

export type WorkspaceContentItem = {
  id: TransformId;
  name: string;
};

export type WorkspaceContents = {
  contents: {
    transforms: WorkspaceContentItem[];
  };
};

export type TransformUpstreamMapping = {
  transform: {
    id: TransformId;
    name: string;
  } | null;
};

export type DownstreamTransformInfo = {
  id: TransformId;
  name: string;
  workspace: {
    id: WorkspaceId;
    name: string;
  };
};

export type TransformDownstreamMapping = {
  transforms: DownstreamTransformInfo[];
};

export type WorkspaceMergeResponse = {
  promoted: { id: TransformId; name: string }[];
  errors?: { id: TransformId; name: string; error: string }[];
  workspace: { id: WorkspaceId; name: string };
  archived_at: string | null;
};
