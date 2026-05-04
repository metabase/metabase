import { hasFeature } from "metabase/common/utils/database";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

export function supportsWorkspaces(database: Database): boolean {
  return hasFeature(database, "workspace");
}

export function getAvailableDatabases(
  databases: Database[],
  workspaceDatabases: WorkspaceDatabase[],
  selectedDatabaseId?: DatabaseId,
): Database[] {
  const configuredIds = new Set(
    workspaceDatabases.map(
      (workspaceDatabase) => workspaceDatabase.database_id,
    ),
  );
  return databases.filter((database) => {
    if (!supportsWorkspaces(database)) {
      return false;
    }
    if (database.id === selectedDatabaseId) {
      return true;
    }
    return !configuredIds.has(database.id);
  });
}
