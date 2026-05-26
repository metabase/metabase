import type {
  TableRemapping,
  WorkspaceInstance,
  WorkspaceInstanceDatabase,
} from "../workspace-instance";

export function createMockWorkspaceInstanceDatabase(
  opts?: Partial<WorkspaceInstanceDatabase>,
): WorkspaceInstanceDatabase {
  return {
    input_schemas: [],
    output: { schema: null, db: null },
    ...opts,
  };
}

export function createMockWorkspaceInstance(
  opts?: Partial<WorkspaceInstance>,
): WorkspaceInstance {
  return {
    name: "Test workspace",
    databases: {},
    ...opts,
  };
}

export function createMockTableRemapping(
  opts?: Partial<TableRemapping>,
): TableRemapping {
  return {
    id: 1,
    database_id: 1,
    from_db: null,
    from_schema: null,
    from_table_name: "orders",
    to_db: null,
    to_schema: null,
    to_table_name: "orders",
    created_at: "2026-01-01T00:00:00Z",
    ...opts,
  };
}
