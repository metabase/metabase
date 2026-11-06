import { match } from "ts-pattern";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";

import { useGetLibraryCollection } from "../use-get-library-collection";

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

  // The Dashboards section never holds data sources
  const subcollectionsWithStuff =
    libraryItems?.data.filter(
      (item) =>
        item.model === "collection" &&
        item.type !== "library-dashboards" &&
        (item.here?.length || item.below?.length),
    ) ?? [];

  const showableLibrary = match({ subcollectionsWithStuff, hasStuff })
    .when(
      // if there's only one subcollection with stuff, we want to go straight into it
      ({ subcollectionsWithStuff }) => subcollectionsWithStuff?.length === 1,
      () => subcollectionsWithStuff[0],
    )
    .when(
      ({ subcollectionsWithStuff }) => subcollectionsWithStuff.length > 1,
      () => libraryCollection,
    )
    .otherwise(() => undefined);

  return {
    isLoading: isLoadingCollection || isLoadingItems,
    data: showableLibrary,
  };
};
