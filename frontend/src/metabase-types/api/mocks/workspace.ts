import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

export function createMockWorkspaceDatabase(
  opts?: Partial<WorkspaceDatabase>,
): WorkspaceDatabase {
  return {
    database_id: 1,
    input_schemas: ["public"],
    status: "unprovisioned",
    ...opts,
  };
}

export function createMockWorkspace(opts?: Partial<Workspace>): Workspace {
  return {
    id: 1,
    name: "Workspace",
    databases: [createMockWorkspaceDatabase()],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    creator_id: null,
    creator: null,
    ...opts,
  };
}
