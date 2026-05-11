import { t } from "ttag";

import type { Database } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "../../types";

export function getInitialName(): string {
  return t`New workspace`;
}

export function getInitialWorkspaceDatabases(
  availableDatabases: Database[],
): WorkspaceDatabaseInfo[] {
  if (availableDatabases.length === 1) {
    return [{ database_id: availableDatabases[0].id, input_schemas: [] }];
  }
  return [];
}
