import type { WorkspaceDatabaseParams } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "./types";

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
