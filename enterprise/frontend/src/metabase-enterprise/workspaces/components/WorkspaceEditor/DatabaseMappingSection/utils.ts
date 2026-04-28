import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

export function isSupportedDatabase(database: Database): boolean {
  return hasFeature(database, "workspace");
}

export function getAvailableDatabases(
  databases: Database[],
  mappings: WorkspaceDatabase[],
  databaseId?: DatabaseId,
): Database[] {
  const mappedIds = new Set(mappings.map((mapping) => mapping.database_id));
  return databases.filter(
    (database) =>
      isSupportedDatabase(database) &&
      (!mappedIds.has(database.id) || database.id === databaseId),
  );
}

type AddTooltipParams = {
  readOnly: boolean;
  hasSupportedDatabases: boolean;
  hasAvailableDatabases: boolean;
};

export function getAddTooltipLabel({
  readOnly,
  hasSupportedDatabases,
  hasAvailableDatabases,
}: AddTooltipParams): string {
  if (readOnly) {
    return t`Deprovision this workspace before editing.`;
  }
  if (!hasSupportedDatabases) {
    return t`No databases support workspaces.`;
  }
  if (!hasAvailableDatabases) {
    return t`All supported databases are already added.`;
  }
  return "";
}
