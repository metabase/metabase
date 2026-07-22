import type { Workspace, WorkspaceDatabase } from "../workspace-manager";

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
