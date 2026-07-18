import type { Database, DatabaseId } from "./database";
import type { UserId, UserInfo } from "./user";

export type WorkspaceId = number;

export type WorkspaceDatabaseStatus =
  | "unprovisioned"
  | "provisioning"
  | "provisioning-failure"
  | "provisioned"
  | "deprovisioning"
  | "deprovisioning-failure";

export type WorkspaceStatus =
  | "unprovisioned"
  | "database-provisioning"
  | "database-provisioning-failure"
  | "instance-provisioning"
  | "instance-provisioning-failure"
  | "provisioned"
  | "instance-deprovisioning"
  | "instance-deprovisioning-failure"
  | "database-deprovisioning"
  | "database-deprovisioning-failure";

export type WorkspaceDatabase = {
  database_id: DatabaseId;
  input_schemas: string[];
  status: WorkspaceDatabaseStatus;
  status_details: string | null;

  database?: Database | null;
};

export type Workspace = {
  id: WorkspaceId;
  name: string;
  status: WorkspaceStatus;
  status_details: string | null;
  instance_id: string | null;
  instance_url: string | null;
  created_at: string;
  creator_id: UserId;

  creator?: UserInfo | null;
  databases?: WorkspaceDatabase[];
};

export type CreateWorkspaceRequest = {
  name: string;
  database_ids: DatabaseId[];
};

export type UpdateWorkspaceRequest = {
  id: WorkspaceId;
  name?: string;
};
