import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/common/collections/utils";
import type { Collection, CollectionType } from "metabase-types/api";

import { getAccessibleCollection } from "../../utils";

export type LibraryCollections = {
  isLoading: boolean;
  libraryCollection: Collection | undefined;
  tableCollection: Collection | undefined;
  metricCollection: Collection | undefined;
  dashboardCollection: Collection | undefined;
};

/**
 * The Library root and the section collections the user can read, from the
 * collection tree. Each is `undefined` while loading or when it is missing.
 */
export function useLibraryCollections(): LibraryCollections {
  const { data: collections, isLoading } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
    "include-library": true,
  });

  return useMemo(() => {
    const libraryCollection = collections?.find(isLibraryCollection);
    const getSection = (type: CollectionType) =>
      libraryCollection && getAccessibleCollection(libraryCollection, type);
    return {
      isLoading,
      libraryCollection,
      tableCollection: getSection("library-data"),
      metricCollection: getSection("library-metrics"),
      dashboardCollection: getSection("library-dashboards"),
    };
  }, [collections, isLoading]);
}
