import type {
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import type { Card, ReplaceSourceEntry, Table } from "metabase-types/api";

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

export function getSelectedValue(item: OmniPickerItem): ReplaceSourceEntry {
  return {
    id: Number(item.id),
    type: item.model === "table" ? "table" : "card",
  };
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
  breadcrumbs.push(table.display_name);

  return {
    icon: "database",
    breadcrumbs,
  };
}

function getCardEntityInfo(card: Card): EntityDisplayInfo {
  if (card.document != null) {
    return {
      icon: "document",
      breadcrumbs: [card.document.name, card.name],
    };
  }
  if (card.dashboard != null) {
    return {
      icon: "dashboard",
      breadcrumbs: [card.dashboard.name, card.name],
    };
  }
  if (card.collection != null) {
    return {
      icon: "collection",
      breadcrumbs: [card.collection.name, card.name],
    };
  }
  return {
    icon: "table2",
    breadcrumbs: [card.name],
  };
}
