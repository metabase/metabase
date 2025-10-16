import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  CardDisplayType,
  DependencyEntry,
  DependencyId,
  DependencyType,
  SearchModel,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type { ItemSelectOption } from "./types";

function getDependencyId(id: SearchResultId): DependencyId {
  if (typeof id === "number") {
    return id;
  } else {
    throw new TypeError(`Unsupported search result id: ${id}`);
  }
}

function getDependencyType(model: SearchModel): DependencyType {
  switch (model) {
    case "card":
    case "dataset":
    case "metric":
      return "card";
    case "table":
      return "table";
    case "transform":
      return "transform";
    default:
      throw new TypeError(`Unsupported search result model: ${model}`);
  }
}

function getDependencyIcon(
  model: SearchModel,
  display?: CardDisplayType | null,
): IconName {
  switch (model) {
    case "card":
      return display != null
        ? (visualizations.get(display)?.iconName ?? "table2")
        : "table2";
    case "dataset":
      return "model";
    case "metric":
      return "metric";
    case "table":
      return "table";
    case "transform":
      return "refresh_downstream";
    default:
      throw new TypeError(`Unsupported search result model: ${model}`);
  }
}

function getDependencyEntry(
  id: SearchResultId,
  model: SearchModel,
): DependencyEntry {
  return {
    id: getDependencyId(id),
    type: getDependencyType(model),
  };
}

export function getSelectOptions(
  searchResults: SearchResult[],
): ItemSelectOption[] {
  return searchResults.map((result) => ({
    type: "search",
    value: `${result.id}-${result.model}`,
    label: result.name,
    icon: getDependencyIcon(result.model, result.display),
    entry: getDependencyEntry(result.id, result.model),
  }));
}
