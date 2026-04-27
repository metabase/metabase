import { t } from "ttag";

import type {
  Database,
  DatabaseId,
  WorkspaceDatabaseDraft,
} from "metabase-types/api";

import { isSupportedDatabase } from "../../../utils";

export function getAvailableDatabases(
  databases: Database[],
  mappings: WorkspaceDatabaseDraft[],
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
