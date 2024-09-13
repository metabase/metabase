import { useMemo } from "react";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type {
  CollectionId,
  CollectionItem,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type { EntityPickerSearchScope, TypeWithModel } from "../types";

export const useScopedSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  searchQuery: string,
  searchModels: string[],
  searchScope: EntityPickerSearchScope,
  folder: Item | undefined,
): SearchResult[] | undefined => {
  const isScopedSearchEnabled = searchScope === "folder" && folder != null;

  const shouldFetchCollectionContent =
    isScopedSearchEnabled && folder.model === "collection";

  const {
    data: collectionItemsData,
    // error,
    // isLoading,
  } = useListCollectionItemsQuery(
    shouldFetchCollectionContent
      ? {
          id: folder.id as CollectionId,
        }
      : skipToken,
  );

  const collectionItems = useMemo(() => {
    return collectionItemsToSearchResults(collectionItemsData?.data ?? []);
  }, [collectionItemsData]);

  const scopedSearchResults: SearchResult[] = collectionItems;

  if (!isScopedSearchEnabled) {
    return undefined;
  }

  return scopedSearchResults.filter(result => {
    const matchesQuery = result.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesModel = searchModels.includes(result.model);
    return matchesQuery && matchesModel;
  });
};

const collectionItemsToSearchResults = (
  items: CollectionItem[],
): SearchResult[] => {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    model: "collection",
  })) as SearchResult[];
};
