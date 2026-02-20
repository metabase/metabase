import type {
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import type {
  Card,
  DatabaseId,
  ReplaceSourceEntry,
  Table,
} from "metabase-types/api";

import { isSameEntity } from "../../../../utils";
import type { EntityInfo } from "../../types";

import type { EntityDisplayInfo } from "./types";

export function getPickerValue(
  entityInfo: EntityInfo | undefined,
): OmniPickerValue | undefined {
  if (entityInfo?.type === "table") {
    return { id: entityInfo.table.id, model: "table" };
  }
  if (entityInfo?.type === "card") {
    return {
      id: entityInfo.card.id,
      model: entityInfo.card.type === "model" ? "dataset" : "card",
    };
  }
  return undefined;
}

function getPickerItemDatabaseId(item: OmniPickerItem): DatabaseId | undefined {
  if (item.model === "database") {
    return item.id;
  }
  if ("database_id" in item) {
    return item.database_id;
  }
  return undefined;
}

export function getIsPickerItemDisabled(
  databaseId: DatabaseId | undefined,
  disabledEntry: ReplaceSourceEntry | undefined,
): ((item: OmniPickerItem) => boolean) | undefined {
  if (databaseId == null && disabledEntry == null) {
    return undefined;
  }
  return (item: OmniPickerItem) => {
    const entry = getSelectedValue(item);
    if (
      entry != null &&
      disabledEntry != null &&
      isSameEntity(entry, disabledEntry)
    ) {
      return true;
    }
    if (databaseId != null) {
      const itemDatabaseId = getPickerItemDatabaseId(item);
      return itemDatabaseId != null && itemDatabaseId !== databaseId;
    }
    return false;
  };
}

export function getSelectedValue(
  item: OmniPickerItem,
): ReplaceSourceEntry | undefined {
  if (item.model === "table") {
    return { id: Number(item.id), type: "table" };
  }
  if (item.model === "card" || item.model === "dataset") {
    return { id: Number(item.id), type: "card" };
  }
  return undefined;
}

export function getEntityDisplayInfo(
  entityInfo: EntityInfo | undefined,
): EntityDisplayInfo | undefined {
  if (entityInfo?.type === "table") {
    return getTableEntityInfo(entityInfo.table);
  }
  if (entityInfo?.type === "card") {
    return getCardEntityInfo(entityInfo.card);
  }
  return undefined;
}

function getTableEntityInfo(table: Table): EntityDisplayInfo {
  const breadcrumbs: string[] = [];
  if (table.db != null) {
    breadcrumbs.push(table.db.name);
  }
  if (table.schema != null) {
    breadcrumbs.push(table.schema);
  }

  return {
    name: table.display_name,
    breadcrumbs,
  };
}

function getCardEntityInfo(card: Card): EntityDisplayInfo {
  if (card.document != null) {
    return {
      name: card.name,
      breadcrumbs: [card.document.name],
    };
  }
  if (card.dashboard != null) {
    return {
      name: card.name,
      breadcrumbs: [card.dashboard.name],
    };
  }
  if (card.collection != null) {
    return {
      name: card.name,
      breadcrumbs: [card.collection.name],
    };
  }

  return {
    name: card.name,
    breadcrumbs: [],
  };
}
