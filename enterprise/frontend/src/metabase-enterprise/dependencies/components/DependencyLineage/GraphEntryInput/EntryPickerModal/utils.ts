import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
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
  if (node.type !== "table") {
    return;
  }

  return {
    id: node.id,
    model: "table",
    name: node.data.name,
    database_id: node.data.db_id,
  };
}

export function getQuestionPickerItem(
  node: DependencyNode,
): QuestionPickerItem | undefined {
  if (node.type !== "card" || node.data.type !== "question") {
    return;
  }

  return {
    id: node.id,
    name: node.data.name,
    model: "card",
  };
}

export function getEntryPickerItem(
  node: DependencyNode,
): EntryPickerItem | undefined {
  return getTablePickerItem(node) ?? getQuestionPickerItem(node);
}

export function getEntryPickerValue(
  item: EntryPickerItem,
): DependencyEntry | undefined {
  if (typeof item.id !== "number") {
    return;
  }

  switch (item.model) {
    case "table":
      return { id: item.id, type: "table" };
    case "card":
    case "dataset":
    case "metric":
      return { id: item.id, type: "card" };
  }
}

export function filterRecents(recentItems: RecentItem[]) {
  return recentItems.filter((item) => SEARCH_MODELS.includes(item.model));
}
