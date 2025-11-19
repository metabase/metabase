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
  stuffs: {
    transforms?: TransformId[];
  };
};

export type WorkspaceContents = {
  contents: {
    transforms: TransformId[];
  };
};
