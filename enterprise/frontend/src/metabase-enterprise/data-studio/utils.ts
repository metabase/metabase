import { useMemo } from "react";
import { match } from "ts-pattern";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type { LibraryCollectionType } from "metabase/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type {
  CollectionItem,
  CollectionItemModel,
  CollectionType,
} from "metabase-types/api";

export function getLibraryCollectionType(
  type: CollectionType | null | undefined,
): LibraryCollectionType | undefined {
  switch (type) {
    case "library":
      return "root";
    case "library-data":
      return "data";
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

  if (collectionType === "library-data") {
    return entityType === "table";
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
      canPlaceEntityInCollection(entityType, "library-data") ||
      canPlaceEntityInCollection(entityType, "library-metrics")
    );
  }

  return false;
}

const isLibrary = (
  collection: CollectionItem | { data: null } | undefined,
): collection is CollectionItem => !!collection && "name" in collection;

export const useGetLibraryCollection = ({
  skip = false,
}: { skip?: boolean } = {}) => {
  const { data, isLoading: isLoadingCollection } = useGetLibraryCollectionQuery(
    undefined,
    { skip },
  );

  const maybeLibrary = useMemo(
    () => (isLibrary(data) ? data : undefined),
    [data],
  );

  return {
    isLoading: isLoadingCollection,
    data: maybeLibrary,
  };
};

export const useGetLibraryChildCollectionByType = ({
  skip,
  type,
}: {
  skip?: boolean;
  type: CollectionType;
}) => {
  const { data: rootLibraryCollection } = useGetLibraryCollection({ skip });
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

// This hook will return the library collection if there are both metrics and models in the library,
// the library-metrics collection if the library has no models, or the library-data collection
// if the library has no metrics
export const useGetResolvedLibraryCollection = ({
  skip = false,
}: { skip?: boolean } = {}) => {
  const { data: libraryCollection, isLoading: isLoadingCollection } =
    useGetLibraryCollection({ skip });

  const hasStuff = Boolean(
    libraryCollection &&
      (libraryCollection?.below?.length || libraryCollection?.here?.length),
  );
  const { data: libraryItems, isLoading: isLoadingItems } =
    useListCollectionItemsQuery(
      libraryCollection && hasStuff ? { id: libraryCollection.id } : skipToken,
    );

  const subcollectionsWithStuff =
    libraryItems?.data.filter(
      (item) =>
        item.model === "collection" &&
        (item.here?.length || item.below?.length),
    ) ?? [];

  const showableLibrary = match({ subcollectionsWithStuff, hasStuff })
    .when(
      // if there's only one subcollection with stuff, we want to go straight into it
      ({ subcollectionsWithStuff }) => subcollectionsWithStuff?.length === 1,
      () => subcollectionsWithStuff[0],
    )
    .with({ hasStuff: true }, () => libraryCollection)
    .otherwise(() => undefined);

  return {
    isLoading: isLoadingCollection || isLoadingItems,
    data: showableLibrary,
  };
};
