import type {
  Workspace,
  WorkspaceDatabase,
  WorkspaceInstance,
} from "../workspace";

import { createMockDatabase } from "./database";

export function createMockWorkspaceDatabase(
  opts?: Partial<WorkspaceDatabase>,
): WorkspaceDatabase {
  return {
    database_id: 1,
    input_schemas: [],
    status: "provisioned",
    database: createMockDatabase(),
    ...opts,
  };
}

export function createMockWorkspace(opts?: Partial<Workspace>): Workspace {
  return {
    id: 1,
    name: "Test workspace",
    databases: [],
    created_at: "2026-01-01T00:00:00Z",
    creator_id: 1,
    ...opts,
  };
}

export function createMockWorkspaceInstance(
  opts?: Partial<WorkspaceInstance>,
): WorkspaceInstance {
  return {
    id: 1,
    name: "Test instance",
    workspace_id: null,
    url: "https://metabase.example.com",
    ...opts,
  };
}
