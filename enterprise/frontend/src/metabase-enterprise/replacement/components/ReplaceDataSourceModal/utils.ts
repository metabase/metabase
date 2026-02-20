import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import type {
  Card,
  DatabaseId,
  ReplaceSourceEntry,
  Table,
} from "metabase-types/api";

import type { EntityInfo } from "./types";

export function getEntityInfo(
  entry: ReplaceSourceEntry | undefined,
  table: Table | undefined,
  card: Card | undefined,
): EntityInfo | undefined {
  if (entry?.type === "table" && entry.id === table?.id) {
    return { type: "table", table };
  }
  if (entry?.type === "card" && entry.id === card?.id) {
    return { type: "card", card };
  }
}

export function getEntityDatabaseId(entry: EntityInfo): DatabaseId | undefined {
  switch (entry.type) {
    case "table":
      return entry.table.db_id;
    case "card":
      return entry.card.database_id;
  }
}

export function getTableRequest(entry: ReplaceSourceEntry | undefined) {
  return entry != null && entry.type === "table" ? { id: entry.id } : skipToken;
}

export function getCardRequest(entry: ReplaceSourceEntry | undefined) {
  return entry != null && entry.type === "card" ? { id: entry.id } : skipToken;
}

export function getDependentsRequest(entry: ReplaceSourceEntry | undefined) {
  return entry != null ? { id: entry.id, type: entry.type } : skipToken;
}

export function getCheckReplaceSourceRequest(
  sourceEntry: ReplaceSourceEntry | undefined,
  targetEntry: ReplaceSourceEntry | undefined,
) {
  if (sourceEntry == null || targetEntry == null) {
    return skipToken;
  }

  return {
    source_entity_id: sourceEntry.id,
    source_entity_type: sourceEntry.type,
    target_entity_id: targetEntry.id,
    target_entity_type: targetEntry.type,
  };
}

export function getSuccessMessage(dependentsCount: number) {
  return ngettext(
    msgid`Updated ${dependentsCount} item`,
    msgid`Updated ${dependentsCount} items`,
    dependentsCount,
  );
}

export function getFailureMessage() {
  return t`Failed to replace data source`;
}
