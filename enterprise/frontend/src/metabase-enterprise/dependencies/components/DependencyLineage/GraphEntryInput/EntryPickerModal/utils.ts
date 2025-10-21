import type { QuestionPickerItem } from "metabase/common/components/Pickers/QuestionPicker";
import type {
  TablePickerItem,
  TablePickerValue,
} from "metabase/common/components/Pickers/TablePicker";
import type { TransformPickerItem } from "metabase/plugins";
import type {
  CardType,
  DependencyEntry,
  DependencyNode,
  RecentItem,
  SearchModel,
  SearchResponse,
} from "metabase-types/api";

import { getDependencyType } from "../../utils";
import { SEARCH_MODELS, SEARCH_MODEL_TO_GROUP_TYPE } from "../constants";

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

function getQuestionPickerModel(type: CardType): QuestionPickerItem["model"] {
  switch (type) {
    case "question":
      return "card";
    case "model":
      return "dataset";
    case "metric":
      return "metric";
  }
}

export function getQuestionPickerItem(
  node: DependencyNode,
): QuestionPickerItem | undefined {
  if (node.type !== "card") {
    return;
  }

  return {
    id: node.id,
    name: node.data.name,
    model: getQuestionPickerModel(node.data.type),
  };
}

export function getTransformPickerItem(
  node: DependencyNode,
): TransformPickerItem | undefined {
  if (node.type !== "transform") {
    return;
  }

  return {
    id: node.id,
    name: node.data.name,
    model: "transform",
  };
}

export function getEntryPickerItem(
  node: DependencyNode,
): EntryPickerItem | undefined {
  return (
    getTablePickerItem(node) ??
    getQuestionPickerItem(node) ??
    getTransformPickerItem(node)
  );
}

export function getEntryPickerValue(
  item: EntryPickerItem,
): DependencyEntry | undefined {
  if (
    typeof item.id !== "number" ||
    item.model === "database" ||
    item.model === "schema"
  ) {
    return;
  }

  const groupType = SEARCH_MODEL_TO_GROUP_TYPE[item.model];
  if (groupType != null) {
    return { id: item.id, type: getDependencyType(groupType) };
  }
}

export function getSupportedRecentItems(recentItems: RecentItem[]) {
  return recentItems.filter((item) => SEARCH_MODELS.includes(item.model));
}

export function hasAvailableModels(
  response: SearchResponse | undefined,
  models: SearchModel[],
) {
  const availableModels = response?.available_models ?? [];
  return models.some((model) => availableModels.includes(model));
}
