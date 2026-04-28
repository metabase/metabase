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

export function getAddTooltipLabel(isReadOnly: boolean): string {
  return isReadOnly
    ? t`Unprovision this workspace before editing.`
    : t`No available databases that support workspaces.`;
}
