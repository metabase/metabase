import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  DependencyEntry,
  DependencyId,
  DependencyType,
  SearchModel,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type { SearchSelectOption } from "./types";

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

export function getDependencyIcon(result: SearchResult): IconName {
  switch (result.model) {
    case "card":
      return result.display != null
        ? (visualizations.get(result.display)?.iconName ?? "table2")
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
      throw new TypeError(`Unsupported search result model: ${result.model}`);
  }
}

export function getDependencyEntry(result: SearchResult): DependencyEntry {
  return {
    id: getDependencyId(result.id),
    type: getDependencyType(result.model),
  };
}

export function getSelectOptions(
  results: SearchResult[],
): SearchSelectOption[] {
  return results.map((result) => ({
    value: `${result.id}-${result.model}`,
    label: result.name,
    icon: getDependencyIcon(result),
    result: result,
  }));
}
