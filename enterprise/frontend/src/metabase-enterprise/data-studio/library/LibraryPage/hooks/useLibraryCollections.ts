import { useMemo } from "react";

import type { Collection } from "metabase-types/api";
import { isLibraryCollection } from "metabase/common/collections/utils";

import { getAccessibleCollection } from "../utils";

export const useLibraryCollections = (collections: Collection[]) => {
  const libraryCollection = useMemo(
    () => collections.find(isLibraryCollection),
    [collections],
  );

  const tableCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-data"),
    [libraryCollection],
  );

  const metricCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-metrics"),
    [libraryCollection],
  );

  return { libraryCollection, tableCollection, metricCollection };
};
