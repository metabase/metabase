import { t } from "ttag";

import type { WorkspaceDatabaseParams } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "./types";

export function getWorkspaceDatabasesError(
  workspaceDatabases: WorkspaceDatabaseInfo[],
): string | undefined {
  if (workspaceDatabases.length === 0) {
    return t`At least one database is required.`;
  }

  if (workspaceDatabases.some((database) => database.database_id == null)) {
    return t`Each database must be selected.`;
  }

  return undefined;
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
