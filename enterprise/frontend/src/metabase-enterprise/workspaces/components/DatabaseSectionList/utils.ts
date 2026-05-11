import type { Database } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "../../types";

export function getSelectableDatabases(
  availableDatabases: Database[],
  workspaceDatabases: WorkspaceDatabaseInfo[],
  workspaceDatabase?: WorkspaceDatabaseInfo,
): Database[] {
  const selectedIds = new Set(
    workspaceDatabases
      .map(({ database_id }) => database_id)
      .filter((database_id) => database_id != null),
  );
  return availableDatabases.filter(
    (database) =>
      database.id === workspaceDatabase?.database_id ||
      !selectedIds.has(database.id),
  );
}
