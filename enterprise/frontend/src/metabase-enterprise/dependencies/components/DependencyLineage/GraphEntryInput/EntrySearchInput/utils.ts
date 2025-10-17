import { t } from "ttag";

import type {
  CardType,
  DependencyId,
  DependencyType,
  RecentItem,
  SearchModel,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import { getNodeIconWithType } from "../../utils";

import type {
  BrowseSelectOption,
  EntrySelectOption,
  ItemSelectOption,
} from "./types";

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
    case "transform":
      return model;
    default:
      throw new TypeError(`Unsupported search result model: ${model}`);
  }
}

function getCardType(model: SearchModel): CardType | undefined {
  switch (model) {
    case "card":
      return "question";
    case "dataset":
      return "model";
    case "metric":
      return "metric";
    default:
      return undefined;
  }
}

function getSelectOptionValue(id: DependencyId, type: DependencyType) {
  return `${id}-${type}`;
}

function getItemOptions<T extends SearchResult | RecentItem>(
  items: T[],
  getLabel: (item: T) => string,
): ItemSelectOption[] {
  return items.map((item) => {
    const id = getDependencyId(item.id);
    const type = getDependencyType(item.model);
    const cardType = getCardType(item.model);
    const cardDisplay =
      item.model === "card" ? (item.display ?? undefined) : undefined;

    return {
      type: "item",
      value: getSelectOptionValue(id, type),
      label: getLabel(item),
      icon: getNodeIconWithType(type, cardType, cardDisplay),
      model: item.model,
      entry: {
        id,
        type,
      },
    };
  });
}

function getSearchOptions(searchResults: SearchResult[]): ItemSelectOption[] {
  return getItemOptions(searchResults, (item) => item.name);
}

function getRecentOptions(
  recentItems: RecentItem[],
  searchModels: SearchModel[],
): ItemSelectOption[] {
  return getItemOptions(
    recentItems.filter((item) => searchModels.includes(item.model)),
    (item) => (item.model === "table" ? item.display_name : item.name),
  );
}

function getBrowseOption(): BrowseSelectOption {
  return {
    type: "browse",
    value: "browse",
    label: t`Browse all`,
    icon: "search",
  };
}

export function getSelectOptions(
  searchResults: SearchResult[],
  recentItems: RecentItem[],
  searchModels: SearchModel[],
  isSearchEnabled: boolean,
): EntrySelectOption[] {
  const options = isSearchEnabled
    ? getSearchOptions(searchResults)
    : getRecentOptions(recentItems, searchModels);

  return [...options, getBrowseOption()];
}
