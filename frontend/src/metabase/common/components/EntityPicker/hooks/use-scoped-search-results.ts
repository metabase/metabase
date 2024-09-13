import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type {
  CollectionId,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type { EntityPickerSearchScope, TypeWithModel } from "../types";

export const useScopedSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  searchResults: SearchResult[] | null,
  searchScope: EntityPickerSearchScope,
  folder: Item | undefined,
): SearchResult[] => {
  const isScopedSearchEnabled = searchScope === "folder" && folder != null;

  const shouldFetchCollectionContent =
    isScopedSearchEnabled && folder.model === "collection";

  const {
    data: collectionItems,
    // error,
    // isLoading,
  } = useListCollectionItemsQuery(
    shouldFetchCollectionContent
      ? {
          id: folder.id as CollectionId,
        }
      : skipToken,
  );

  const scopedSearchResults: SearchResult[] = collectionItems?.data;

  //TODO: filter by query
  return isScopedSearchEnabled ? scopedSearchResults : (searchResults ?? []);
};
