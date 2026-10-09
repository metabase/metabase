import { useMemo } from "react";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type { CollectionItem, CollectionType } from "metabase-types/api";

import { useGetLibraryCollection } from "../use-get-library-collection";

export const useGetLibraryChildCollectionByType = ({
  skip,
  type,
}: {
  skip?: boolean;
  type: CollectionType;
}) => {
  const { data: rootLibraryCollection, isLoading: isLoadingLibrary } =
    useGetLibraryCollection({ skip });
  const { data: libraryCollections, isLoading: isLoadingItems } =
    useListCollectionItemsQuery(
      rootLibraryCollection ? { id: rootLibraryCollection.id } : skipToken,
    );
  const data = useMemo(
    () =>
      libraryCollections?.data.find(
        (collection: CollectionItem) => collection.type === type,
      ),
    [libraryCollections, type],
  );

  return {
    data,
    isLoading:
      isLoadingLibrary || (rootLibraryCollection != null && isLoadingItems),
  };
};
