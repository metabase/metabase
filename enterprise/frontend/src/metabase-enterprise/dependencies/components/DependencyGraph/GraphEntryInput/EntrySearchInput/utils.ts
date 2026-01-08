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

import { getDependencyType, getNodeIconWithType } from "../../../../utils";
import { SEARCH_MODEL_TO_GROUP_TYPE } from "../constants";

import { BROWSE_OPTION_VALUE } from "./constants";
import type { EntrySelectOption } from "./types";

function getItemDependencyId(id: SearchResultId): DependencyId {
  if (typeof id === "number") {
    return id;
  } else {
    throw new TypeError(`Unsupported search result id: ${id}`);
  }
}

function getItemDependencyType(model: SearchModel): DependencyType {
  const groupType = SEARCH_MODEL_TO_GROUP_TYPE[model];
  if (groupType == null) {
    throw new Error(`Search model "${model}" is not supported`);
  }
  return getDependencyType(groupType);
}

function getItemCardType(model: SearchModel): CardType | undefined {
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

function getOptionValue(id: DependencyId, type: DependencyType) {
  return `${id}-${type}`;
}

function getItemOptions<T extends SearchResult | RecentItem>(
  items: T[],
  getLabel: (item: T) => string,
): EntrySelectOption[] {
  return items.map((item) => {
    const id = getItemDependencyId(item.id);
    const type = getItemDependencyType(item.model);
    const cardType = getItemCardType(item.model);
    const cardDisplay =
      item.model === "card" ? (item.display ?? undefined) : undefined;

    return {
      type: "item",
      value: getOptionValue(id, type),
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

function getSearchOptions(searchResults: SearchResult[]): EntrySelectOption[] {
  return getItemOptions(searchResults, (item) => item.name);
}

function getRecentOptions(
  recentItems: RecentItem[],
  searchModels: SearchModel[],
): EntrySelectOption[] {
  return getItemOptions(
    recentItems.filter((item) => searchModels.includes(item.model)),
    (item) => (item.model === "table" ? item.display_name : item.name),
  );
}

function getBrowseOption(): EntrySelectOption {
  return {
    type: "browse",
    value: BROWSE_OPTION_VALUE,
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
