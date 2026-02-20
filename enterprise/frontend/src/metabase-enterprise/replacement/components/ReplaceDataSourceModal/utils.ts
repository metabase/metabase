import { skipToken } from "metabase/api";
import type { Card, ReplaceSourceEntry, Table } from "metabase-types/api";

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
