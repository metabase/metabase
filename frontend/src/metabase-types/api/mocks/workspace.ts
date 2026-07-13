import type {
  Workspace,
  WorkspaceDatabase,
  WorkspaceInstance,
} from "../workspace-manager";

export function createMockWorkspaceDatabase(
  opts?: Partial<WorkspaceDatabase>,
): WorkspaceDatabase {
  return {
    database_id: 1,
    input_schemas: [],
    status: "provisioned",
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
    url: "https://child.example.com",
    workspace_id: null,
    initialized_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...opts,
  };
}
