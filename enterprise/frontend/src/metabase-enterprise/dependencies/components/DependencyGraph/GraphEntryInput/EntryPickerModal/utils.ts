import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
  OmniPickerQuestionItem,
  OmniPickerTableItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import type { TransformPickerItem } from "metabase/plugins/oss/transforms";
import type {
  CardType,
  DependencyEntry,
  DependencyNode,
  SearchModel,
  SearchResponse,
} from "metabase-types/api";

import { getDependencyType } from "../../../../utils";
import { SEARCH_MODEL_TO_GROUP_TYPE } from "../constants";


export function getTablePickerItem(
  node: DependencyNode,
): OmniPickerTableItem | undefined {
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
    namespace: "transforms",
  };
}

function getCardPickerModel(type: CardType): OmniPickerQuestionItem["model"] {
  switch (type) {
    case "question":
      return "card";
    case "model":
      return "dataset";
    case "metric":
      return "metric";
  }
}

function getCardPickerItem(
  node: DependencyNode,
  cardType: CardType,
): OmniPickerQuestionItem | undefined {
  if (node.type !== "card" || node.data.type !== cardType) {
    return;
  }

  return {
    id: node.id,
    name: node.data.name,
    model: getCardPickerModel(node.data.type),
  };
}

export function getQuestionPickerItem(
  node: DependencyNode,
): OmniPickerQuestionItem | undefined {
  return getCardPickerItem(node, "question");
}

export function getModelPickerItem(
  node: DependencyNode,
): OmniPickerQuestionItem | undefined {
  return getCardPickerItem(node, "model");
}

export function getMetricPickerItem(
  node: DependencyNode,
): OmniPickerQuestionItem | undefined {
  return getCardPickerItem(node, "metric");
}

export function getDashboardPickerItem(
  node: DependencyNode,
): (OmniPickerCollectionItem & { model: "dashboard" }) | undefined {
  if (node.type !== "dashboard") {
    return;
  }
  return { id: node.id, model: "dashboard", name: node.data.name };
}

export function getEntryPickerItem(
  node: DependencyNode,
): OmniPickerValue | undefined {
  return (
    getTablePickerItem(node) ??
    getTransformPickerItem(node) ??
    getQuestionPickerItem(node) ??
    getModelPickerItem(node) ??
    getMetricPickerItem(node) ??
    getDashboardPickerItem(node)
  );
}

export function getEntryPickerValue(
  item: OmniPickerItem,
): DependencyEntry | undefined {
  if (
    typeof item.id !== "number" ||
    item.model === "database" ||
    item.model === "schema"
  ) {
    return;
  }

  const groupType = SEARCH_MODEL_TO_GROUP_TYPE[item.model as SearchModel];
  if (groupType != null) {
    return { id: item.id, type: getDependencyType(groupType) };
  }
}

export function hasAvailableModels(
  response: SearchResponse | undefined,
  models: SearchModel[],
) {
  const availableModels = response?.available_models ?? [];
  return models.some((model) => availableModels.includes(model));
}
