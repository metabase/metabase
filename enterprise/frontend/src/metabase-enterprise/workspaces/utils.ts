import { t } from "ttag";

import type { Database, WorkspaceDatabaseParams } from "metabase-types/api";

import type { ValidationResult, WorkspaceDatabaseInfo } from "./types";

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
    (result, { database_id, input_schemas }) => {
      if (database_id != null) {
        result.push({ database_id, input_schemas });
      }
      return result;
    },
    [],
  );
}

export function validateWorkspaceDatabases(
  workspaceDatabases: WorkspaceDatabaseInfo[],
): ValidationResult {
  if (workspaceDatabases.length === 0) {
    return {
      isValid: false,
      errorMessage: t`At least one database is required.`,
    };
  }
  if (workspaceDatabases.some((database) => database.database_id == null)) {
    return {
      isValid: false,
      errorMessage: t`Each database must be selected.`,
    };
  }
  return { isValid: true };
}
