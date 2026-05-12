import type { Database, WorkspaceDatabase } from "metabase-types/api";

export function getSelectableDatabases(
  availableDatabases: Database[],
  workspaceDatabases: WorkspaceDatabase[],
): Database[] {
  const selectedIds = new Set(
    workspaceDatabases.map(({ database_id }) => database_id),
  );
  return availableDatabases.filter((database) => !selectedIds.has(database.id));
}
