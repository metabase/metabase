import { c, msgid, t } from "ttag";

import { color } from "metabase/lib/colors";
import type { ObjectWithModel } from "metabase/lib/icon";
import { getIcon } from "metabase/lib/icon";
import {
  SEARCH_MODELS,
  type SearchModel,
  type SearchResult,
  type SearchResultId,
} from "metabase-types/api";

import { RECENTS_TAB_ID } from "./constants";
import type { EntityPickerTab, TypeWithModel } from "./types";

export const getEntityPickerIcon = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  isSelected?: boolean,
) => {
  const icon = getIcon(item as ObjectWithModel);

  if (["person", "group"].includes(icon.name)) {
    // should inherit color
    return icon;
  }

  if (isSelected && !icon.color) {
    icon.color = color("text-white");
  }

  if (icon.name === "folder" && isSelected) {
    icon.name = "folder_filled";
  }

  return { ...icon, color: color(icon.color ?? "brand") };
};

export const isSelectedItem = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  selectedItem: TypeWithModel<Id, Model> | null,
): boolean => {
  return (
    !!selectedItem &&
    item.id === selectedItem.id &&
    item.model === selectedItem.model
  );
};

export const computeInitialTabId = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  initialValue,
  tabs,
  defaultToRecentTab,
}: {
  initialValue?: Partial<Item>;
  tabs: EntityPickerTab<Id, Model, Item>[];
  defaultToRecentTab: boolean;
}): string => {
  const hasRecents = tabs.some(tab => tab.id === RECENTS_TAB_ID);

  if (hasRecents && defaultToRecentTab) {
    return RECENTS_TAB_ID;
  }

  const initialValueTab =
    initialValue?.model && tabs.find(tab => tab.model === initialValue.model);

  if (initialValueTab) {
    return initialValueTab.id;
  }

  return tabs[0].id;
};

const emptySearchResultTranslationContext = c(
  "the title of a ui tab that contains search results",
);
const searchResultTranslationContext = c(
  "the title of a ui tab that contains search results where {0} is the number of search results and {1} is the user-supplied search query.",
);

export function getSearchTabText(
  searchResults: SearchResult[] | null,
  searchQuery: string,
): string {
  if (!searchResults || !searchResults.length) {
    return emptySearchResultTranslationContext.t`Search results`;
  }

  return searchResultTranslationContext.ngettext(
    msgid`${searchResults.length} result for "${searchQuery.trim()}"`,
    `${searchResults.length} results for "${searchQuery.trim()}"`,
    searchResults.length,
  );
}

export const getSearchModels = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  tabs: EntityPickerTab<Id, Model, Item>[],
): SearchModel[] => {
  return tabs.flatMap(({ model }) => {
    return model && isSearchModel(model) ? [model] : [];
  });
};

export const getFolderModels = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  tabs: EntityPickerTab<Id, Model, Item>[],
): Model[] => {
  return tabs.flatMap(({ folderModels }) => folderModels);
};

const isSearchModel = (model: string): model is SearchModel => {
  return SEARCH_MODELS.some(searchModel => searchModel === model);
};

export const getSearchInputPlaceholder = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  folder: Item | undefined,
): string => {
  if (folder?.model === "collection") {
    return t`Search this collection or everywhere…`;
  }

  if (folder?.model === "database") {
    return t`Search this database or everywhere…`;
  }

  if (folder?.model === "schema") {
    return t`Search this schema or everywhere…`;
  }

  return t`Search…`;
};
