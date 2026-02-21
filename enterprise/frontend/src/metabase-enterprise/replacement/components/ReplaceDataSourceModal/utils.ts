import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import type { Card, ReplaceSourceEntry, Table } from "metabase-types/api";

import type { EntityItem } from "./types";

export function getEntityItem(
  entry: ReplaceSourceEntry | undefined,
  table: Table | undefined,
  card: Card | undefined,
): EntityItem | undefined {
  if (entry?.type === "table") {
    return {
      id: entry.id,
      type: "table",
      data: table?.id === entry.id ? table : undefined,
    };
  }
  if (entry?.type === "card") {
    return {
      id: entry.id,
      type: "card",
      data: card?.id === entry.id ? card : undefined,
    };
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
