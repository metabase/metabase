import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers/EntityPicker/types";
import { allCollectionModels } from "metabase/common/components/Pickers/EntityPicker/utils";
import type {
  GetEntityPickerSyntheticLibraryItemFunction,
  LibrarySubCollectionType,
} from "metabase/plugins/oss/library";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type { CollectionItem, CollectionType } from "metabase-types/api";

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

type LibrarySectionCollectionItem = CollectionItem &
  OmniPickerCollectionItem & {
    model: "collection";
    type: LibrarySubCollectionType;
  };

function getLibrarySectionName(type: LibrarySubCollectionType) {
  switch (type) {
    case "library-data":
      return t`Data`;
    case "library-metrics":
      return t`Metrics`;
  }
}

export function getCollectionPickerItems({
  parentItem,
  items,
}: {
  parentItem: OmniPickerItem;
  items: CollectionItem[];
}): OmniPickerItem[] | undefined {
  if (parentItem.model !== "collection" || parentItem.type !== "library") {
    return undefined;
  }

  const librarySubCollectionType: LibrarySubCollectionType[] = [
    "library-data",
    "library-metrics",
  ];

  return librarySubCollectionType.flatMap((type) => {
    const sectionItems = items.filter((item) =>
      isLibrarySectionCollectionItem(item, type),
    );

    const realRoot = sectionItems.find((item) => item.is_library_root);
    if (realRoot) {
      return [realRoot];
    }

    if (sectionItems.length > 0) {
      const syntheticItem = getEntityPickerSyntheticLibraryItem({
        collectionId: parentItem.id,
        type,
      });

      return syntheticItem ? [syntheticItem] : [];
    }

    return [];
  });
}

function isLibrarySectionCollectionItem(
  item: CollectionItem,
  type: LibrarySubCollectionType,
): item is LibrarySectionCollectionItem {
  return item.model === "collection" && item.type === type;
}

export const getEntityPickerSyntheticLibraryItem: GetEntityPickerSyntheticLibraryItemFunction =
  ({ collectionId, type }) => {
    return {
      id: `${type}-${collectionId}`,
      sourceCollectionId: collectionId,
      name: getLibrarySectionName(type),
      model: "collection",
      type,
      can_write: false,
      location: "/",
      here: [],
      below: allCollectionModels,
      childTypeFilter: type,
    };
  };

export const getLibraryCollectionEmptyStateMessages = (
  type: LibrarySubCollectionType,
) => {
  if (type === "library-data") {
    return {
      title: t`No published tables yet`,
      description: t`Publish tables in the Library to see them here.`,
    };
  }

  return {
    title: t`No metrics yet`,
    description: t`Put metrics in the Library to see them here.`,
  };
};

export const isLibrarySubCollectionType = (
  type?: string | null,
): type is LibrarySubCollectionType => {
  return type === "library-data" || type === "library-metrics";
};

export const isLibraryCollectionType = (
  type?: string | null,
): type is LibrarySubCollectionType => {
  return isLibrarySubCollectionType(type) || type === "library";
};
