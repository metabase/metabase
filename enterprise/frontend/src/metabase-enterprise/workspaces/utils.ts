import type { Database, WorkspaceDatabaseParams } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "./types";

export function getAvailableDatabases(databases: Database[]): Database[] {
  return databases.filter(
    (database) =>
      database.features?.includes("workspace") &&
      !database.is_sample &&
      !database.is_audit,
  );
}

export function getValidWorkspaceDatabases(
  workspaceDatabases: WorkspaceDatabaseInfo[],
): WorkspaceDatabaseParams[] {
  return workspaceDatabases.reduce<WorkspaceDatabaseParams[]>(
    (result, { database_id, input }) => {
      if (database_id != null) {
        result.push({ database_id, input });
      }
      return result;
    },
    [],
  );
}
