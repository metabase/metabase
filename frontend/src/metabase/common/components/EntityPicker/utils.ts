import { c, msgid, t } from "ttag";

import type { ObjectWithModel } from "metabase/lib/icon";
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
import type {
  EntityPickerSearchScope,
  EntityPickerTab,
  SearchItem,
  TypeWithModel,
} from "./types";

export const getEntityPickerIcon = <Id, Model extends string>(
  item: TypeWithModel<Id, Model>,
  {
    isSelected,
    isTenantUser,
  }: {
    isSelected?: boolean;
    isTenantUser?: boolean;
  } = {},
) => {
  const icon = getIcon(item as ObjectWithModel, { isTenantUser });

  if (["person", "group"].includes(icon.name)) {
    // should inherit color
    return icon;
  }

  if (isSelected && !icon.color) {
    icon.color = "text-primary-inverse";
  }

  if (icon.name === "folder" && isSelected) {
    icon.name = "folder_filled";
  }

  return { ...icon, color: undefined, c: icon.color ?? "brand" };
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
