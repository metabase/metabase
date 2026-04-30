import type {
  TableRemapping,
  Workspace,
  WorkspaceDatabase,
  WorkspaceInstance,
  WorkspaceInstanceDatabase,
} from "metabase-types/api";

export function createMockWorkspaceDatabase(
  opts?: Partial<WorkspaceDatabase>,
): WorkspaceDatabase {
  return {
    database_id: 1,
    input_schemas: ["public"],
    output_schema: "workspace",
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

export function createMockWorkspaceInstanceDatabase(
  opts?: Partial<WorkspaceInstanceDatabase>,
): WorkspaceInstanceDatabase {
  return {
    name: "Sample Database",
    input_schemas: ["public"],
    output_schema: "workspace",
    ...opts,
  };
}

export function createMockWorkspaceInstance(
  opts?: Partial<WorkspaceInstance>,
): WorkspaceInstance {
  return {
    name: "Workspace",
    databases: { 1: createMockWorkspaceInstanceDatabase() },
    remappings_count: 0,
    ...opts,
  };
}

export function createMockTableRemapping(
  opts?: Partial<TableRemapping>,
): TableRemapping {
  return {
    id: 1,
    database_id: 1,
    from_schema: "public",
    from_table_name: "orders_source",
    from_table_id: 10,
    to_schema: "workspace",
    to_table_name: "orders_remapped",
    to_table_id: 20,
    created_at: "2024-01-01T00:00:00Z",
    ...opts,
  };
}
