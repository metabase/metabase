import { msgid, ngettext } from "ttag";

import { skipToken } from "metabase/api";
import type {
  Card,
  DatabaseId,
  DependencyNode,
  SourceReplacementCheckInfo,
  SourceReplacementEntry,
  Table,
} from "metabase-types/api";

import type { EntityItem } from "./types";

export function getEntityItem(
  entry: SourceReplacementEntry | undefined,
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

export function getEntityDatabaseId(
  entity: EntityItem,
): DatabaseId | undefined {
  switch (entity.type) {
    case "table":
      return entity.data?.db_id;
    case "card":
      return entity.data?.database_id;
  }
}

export function getTableRequest(entry: SourceReplacementEntry | undefined) {
  return entry != null && entry.type === "table" ? { id: entry.id } : skipToken;
}

export function getCardRequest(entry: SourceReplacementEntry | undefined) {
  return entry != null && entry.type === "card" ? { id: entry.id } : skipToken;
}

export function getDependentsRequest(
  entry: SourceReplacementEntry | undefined,
) {
  return entry != null ? { id: entry.id, type: entry.type } : skipToken;
}

export function getCheckReplaceSourceRequest(
  sourceEntry: SourceReplacementEntry | undefined,
  targetEntry: SourceReplacementEntry | undefined,
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

export function canReplaceSource(
  checkInfo: SourceReplacementCheckInfo | undefined,
  dependents: DependencyNode[] | undefined,
) {
  return (
    checkInfo != null &&
    checkInfo.success &&
    dependents != null &&
    dependents.length > 0
  );
}

export function getConfirmTitle(dependentsCount: number): string {
  return ngettext(
    msgid`Really replace the data source in this ${dependentsCount} item?`,
    `Really replace the data sources in these ${dependentsCount} items?`,
    dependentsCount,
  );
}

export function getConfirmSubmitLabel(dependentsCount: number): string {
  return ngettext(
    msgid`Replace data source in ${dependentsCount} item`,
    `Replace data source in ${dependentsCount} items`,
    dependentsCount,
  );
}
