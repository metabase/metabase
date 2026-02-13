import type {
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import type { IconName } from "metabase/ui";
import type { Card, ReplaceSourceEntry, Table } from "metabase-types/api";

export function getPickerValue(
  table: Table | undefined,
  card: Card | undefined,
): OmniPickerValue | undefined {
  if (table != null) {
    return { id: table.id, model: "table" };
  }
  if (card != null) {
    return { id: card.id, model: card.type === "model" ? "dataset" : "card" };
  }
  return undefined;
}

export function getSelectedValue(item: OmniPickerItem): ReplaceSourceEntry {
  return {
    id: Number(item.id),
    type: item.model === "table" ? "table" : "card",
  };
}

export type SourceInfo = {
  icon: IconName;
  breadcrumbs: string[];
};

export function getSourceInfo(
  table: Table | undefined,
  card: Card | undefined,
): SourceInfo | undefined {
  if (table != null) {
    return getTableSourceInfo(table);
  }
  if (card != null) {
    return getCardSourceInfo(card);
  }
  return undefined;
}

function getTableSourceInfo(table: Table): SourceInfo {
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

function getCardSourceInfo(card: Card): SourceInfo {
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
