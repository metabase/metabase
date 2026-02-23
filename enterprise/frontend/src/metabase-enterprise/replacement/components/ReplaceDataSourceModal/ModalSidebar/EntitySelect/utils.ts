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
import type { EntityItem } from "../../types";

import type { EntityItemInfo } from "./types";

export function getPickerValue(item: EntityItem): OmniPickerValue | undefined {
  if (item.type === "table") {
    return { id: item.id, model: "table" };
  }
  if (item.type === "card") {
    return {
      id: item.id,
      model: item.data?.type === "model" ? "dataset" : "card",
    };
  }
  return undefined;
}

export function getPickerItemDatabaseId(
  item: OmniPickerItem,
): DatabaseId | undefined {
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
  disabledItem: EntityItem | undefined,
): ((item: OmniPickerItem) => boolean) | undefined {
  if (databaseId == null && disabledItem == null) {
    return undefined;
  }
  return (item: OmniPickerItem) => {
    const entityItem = getEntityItem(item);
    if (
      entityItem != null &&
      disabledItem != null &&
      isSameEntity(entityItem, disabledItem)
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

export function getEntityItem(
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

export function getEntityItemInfo(
  item: EntityItem,
): EntityItemInfo | undefined {
  if (item.type === "table" && item.data != null) {
    return getTableEntityItemInfo(item.data);
  }
  if (item.type === "card" && item.data != null) {
    return getCardEntityItemInfo(item.data);
  }
  return undefined;
}

function getTableEntityItemInfo(table: Table): EntityItemInfo {
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

function getCardEntityItemInfo(card: Card): EntityItemInfo {
  const breadcrumbs: string[] = [];
  if (card.document != null) {
    breadcrumbs.push(card.document.name);
  } else if (card.dashboard != null) {
    breadcrumbs.push(card.dashboard.name);
  } else if (card.collection != null) {
    breadcrumbs.push(card.collection.name);
  }

  return {
    name: card.name,
    breadcrumbs,
  };
}
