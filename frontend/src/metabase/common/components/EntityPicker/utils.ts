import { c, msgid, t } from "ttag";

import { getIcon } from "metabase/lib/icon";
import {
  type DatabaseId,
  SEARCH_MODELS,
  type SearchModel,
  type SearchResult,
  type SearchResultId,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { RECENTS_TAB_ID } from "./constants";
import type { OmniPickerContextValue } from "./context";
import {
  type EntityPickerSearchScope,
  type EntityPickerTab,
  type OmniPickerFolderItem,
  OmniPickerFolderModel,
  type OmniPickerItem,
  type SearchItem,
  type TypeWithModel,
} from "./types";

export const getEntityPickerIcon = (
  item: OmniPickerItem,
  isSelected?: boolean,
) => {
  const icon = getIcon(item);

  if (["person", "group"].includes(icon.name)) {
    // should inherit color
    return icon;
  }

  if (isSelected && !icon.color) {
    icon.color = "text-white";
  }

  if (icon.name === "folder" && isSelected) {
    icon.name = "folder_filled";
  }

  return { ...icon, color: undefined, c: icon.color ?? "brand" };
};

export const isSelectedItem = (
  item: OmniPickerItem,
  selectedItem: OmniPickerItem | null,
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
  const hasRecents = tabs.some((tab) => tab.id === RECENTS_TAB_ID);

  if (hasRecents && defaultToRecentTab) {
    return RECENTS_TAB_ID;
  }

  const initialValueTab =
    initialValue?.model &&
    tabs.find((tab) => tab.models.includes(initialValue.model as Model));

  if (initialValueTab) {
    return initialValueTab.id;
  }

  return tabs[0]?.id;
};

const emptySearchResultTranslationContext = c(
  "the title of a ui tab that contains search results",
);
const searchResultTranslationContext = c(
  "the title of a ui tab that contains search results where {0} is the number of search results and {1} is the user-supplied search query.",
);

export function getSearchTabText(
  searchResults: SearchItem[] | null,
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
  return tabs.flatMap(({ models }) => {
    return models && isArrayOfSearchModels(models) ? models : [];
  });
};

export const getSearchFolderModels = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  tabs: EntityPickerTab<Id, Model, Item>[],
): Model[] => {
  return tabs.flatMap(({ folderModels }) => folderModels);
};

export const isSearchFolder = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  folder: Item,
  folderModels: Model[],
) => {
  return (
    folder.id !== "personal" &&
    folder.id !== "databases" &&
    folderModels.includes(folder.model)
  );
};

const isSearchModel = (model: string): model is SearchModel => {
  return SEARCH_MODELS.some((searchModel) => searchModel === model);
};

const isArrayOfSearchModels = (models: string[]): models is SearchModel[] => {
  return models.every(isSearchModel);
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
    // we're not showing schema selection step if there's only 1 schema
    if (isSchemaItem(folder) && folder.isOnlySchema) {
      return t`Search this database or everywhere…`;
    }

    return t`Search this schema or everywhere…`;
  }

  if (folder?.model === "dashboard") {
    return t`Search this dashboard or everywhere…`;
  }

  return t`Search…`;
};

export const getScopedSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  searchResults: SearchResult[] | null,
  searchScope: EntityPickerSearchScope,
  folder: Item | undefined,
): SearchResult[] => {
  if (!searchResults) {
    return [];
  }

  if (searchScope === "everywhere" || !folder) {
    return searchResults;
  }

  if (folder.model === "database") {
    return searchResults.filter(
      (result) => result.model === "table" && result.database_id === folder.id,
    );
  }

  if (folder.model === "schema") {
    return searchResults.filter(
      (result) => result.model === "table" && result.table_schema === folder.id,
    );
  }

  if (folder.model === "collection") {
    return searchResults.filter(
      (result) => result.collection?.id === folder.id,
    );
  }

  return [];
};

export const isSchemaItem = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  item: Item,
): item is Item & {
  dbId: DatabaseId;
  dbName: string;
  isOnlySchema: boolean;
} => {
  return (
    isObject(item) &&
    "dbId" in item &&
    typeof item.dbId === "number" &&
    "dbName" in item &&
    typeof item.dbName === "string" &&
    "isOnlySchema" in item &&
    typeof item.isOnlySchema === "boolean"
  );
};

const isValidItem = (
  item: unknown,
): item is OmniPickerItem => {
  return isObject(item)
    && "model" in item
    && typeof item.model === "string"
    && !!item.id;
};

export function getItemFunctions({
  models,
  isFolderItem,
  isHiddenItem,
  isDisabledItem,
  isSelectableItem,
}:{
  models: OmniPickerContextValue["models"],
  isFolderItem?: OmniPickerContextValue["isFolderItem"],
  isHiddenItem?: OmniPickerContextValue["isHiddenItem"],
  isDisabledItem?: OmniPickerContextValue["isDisabledItem"],
  isSelectableItem?: OmniPickerContextValue["isSelectableItem"],
}) {
  const modelSet = new Set(models);

  const isFolder = (
    item: OmniPickerItem | unknown,
  ): item is OmniPickerFolderItem => {
    if (!isValidItem(item)) {
      return false;
    }

    if (isFolderItem && !isFolderItem(item)) {
      return false;
    }

    if (
      item.model === OmniPickerFolderModel.Database ||
      item.model === OmniPickerFolderModel.Schema
    ) {
      return true;
    }

    if (item.model !== OmniPickerFolderModel.Collection) {
      return false;
    }

    if (!("here" in item) && !("below" in item)) {
      return false;
    }

    const hereBelowSet = Array.from(
      new Set([
        ...("here" in item && Array.isArray(item.here) ? item.here : []),
        ...("below" in item && Array.isArray(item.below) ? item.below : []),
      ]),
    );
    return (
      item.model === OmniPickerFolderModel.Collection &&
      hereBelowSet.some((hereBelowModel) => modelSet.has(hereBelowModel))
    );
  };

  const isHidden = (item: OmniPickerItem | unknown): item is unknown => {
    if (!isValidItem(item)) {
      return false;
    }

    if (isHiddenItem && isHiddenItem(item)) {
      return true;
    }

    return (
      !modelSet.has(item.model as OmniPickerItem["model"]) &&
      !isFolder(item)
    );
  };

  const isDisabled = (item: OmniPickerItem | unknown): item is OmniPickerItem => {
    if (isDisabledItem && isDisabledItem(item)) {
      return true;
    }

    return false;
  };

  const isSelectable = (item: OmniPickerItem | unknown): item is OmniPickerItem => {
    if (isSelectableItem && isSelectableItem(item)) {
      return true;
    }

    if (!isValidItem(item)) {
      return false;
    }

    return modelSet.has(item.model);
  }

  return {
    isFolderItem: isFolder,
    isHiddenItem: isHidden,
    isDisabledItem: isDisabled,
    isSelectableItem: isSelectable,
  };
}
