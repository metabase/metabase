import { match } from "ts-pattern";

import type {
  TablePickerItem,
  TablePickerValue,
} from "metabase/common/components/Pickers/TablePicker";
import type {
  DependencyEntry,
  DependencyNode,
  RecentItem,
} from "metabase-types/api";

import { SEARCH_MODELS } from "../constants";

import type { EntryPickerItem } from "./types";

export function getTablePickerValue(
  node: DependencyNode,
): TablePickerValue | undefined {
  if (node.type === "table") {
    return {
      id: node.id,
      model: "table",
      name: node.data.name,
      schema: node.data.schema,
      db_id: node.data.db_id,
    };
  }
}

export function getTablePickerItem(
  node: DependencyNode,
): TablePickerItem | undefined {
  if (node.type === "table") {
    return {
      id: node.id,
      model: "table",
      name: node.data.name,
      database_id: node.data.db_id,
    };
  }
}

export function getEntryPickerItem(
  node: DependencyNode,
): EntryPickerItem | undefined {
  return getTablePickerItem(node);
}

export function getEntryPickerValue(
  item: EntryPickerItem,
): DependencyEntry | undefined {
  return match<EntryPickerItem, DependencyEntry | undefined>(item)
    .with({ model: "table" }, (item) => ({
      id: Number(item.id),
      type: "table",
    }))
    .otherwise(() => undefined);
}

export function filterRecents(recentItems: RecentItem[]) {
  return recentItems.filter((item) => SEARCH_MODELS.includes(item.model));
}
