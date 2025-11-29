import { useMemo } from "react";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type { LibraryCollectionType } from "metabase/plugins";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type {
  CollectionItem,
  CollectionItemModel,
  CollectionType,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

// Must be in sync with CanAccessDataStudio in frontend/src/metabase/route-guards.tsx
export function canAccessDataStudio(state: State) {
  return getUserIsAdmin(state) && !getIsEmbeddingIframe(state);
}

export function getLibraryCollectionType(
  type: CollectionType | null | undefined,
): LibraryCollectionType | undefined {
  switch (type) {
    case "library":
      return "root";
    case "library-models":
      return "models";
    case "library-metrics":
      return "metrics";
  }
}

export function canPlaceEntityInCollection(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (getLibraryCollectionType(collectionType) == null) {
    return true;
  }

  // Can't create subcollections in any of special collections
  if (entityType === "collection") {
    return false;
  }

  // Can't create anything in the root Library collection
  if (collectionType === "library") {
    return false;
  }

  if (collectionType === "library-models") {
    return entityType === "dataset";
  }

  if (collectionType === "library-metrics") {
    return entityType === "metric";
  }

  return false;
}

export function canPlaceEntityInCollectionOrDescendants(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (canPlaceEntityInCollection(entityType, collectionType)) {
    return true;
  }

  if (collectionType === "library") {
    return (
      canPlaceEntityInCollection(entityType, "library-models") ||
      canPlaceEntityInCollection(entityType, "library-metrics")
    );
  }

  return false;
}

export const useGetLibraryCollection = ({
  skip = false,
}: { skip?: boolean } = {}) => {
  const { data: libraryCollection, isLoading: isLoadingCollection } =
    useGetLibraryCollectionQuery(undefined, { skip });

  return {
    isLoading: isLoadingCollection,
    data: libraryCollection,
  };
};

export const useGetLibraryChildCollectionByType = ({
  skip,
  type,
}: {
  skip?: boolean;
  type: CollectionType;
}) => {
  const { data: rootLibraryCollection } = useGetLibraryCollectionQuery(
    undefined,
    { skip },
  );
  const { data: libraryCollections } = useListCollectionItemsQuery(
    rootLibraryCollection ? { id: rootLibraryCollection.id } : skipToken,
  );
  return useMemo(
    () =>
      libraryCollections?.data.find(
        (collection: CollectionItem) => collection.type === type,
      ),
    [libraryCollections, type],
  );
};
