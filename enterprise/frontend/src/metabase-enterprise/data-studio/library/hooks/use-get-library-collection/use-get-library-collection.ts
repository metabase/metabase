import { useMemo } from "react";

import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
import type { CollectionItem } from "metabase-types/api";

const isLibrary = (
  collection: CollectionItem | { data: null } | undefined,
): collection is CollectionItem => !!collection && "name" in collection;

export const useGetLibraryCollection = ({
  skip = false,
}: { skip?: boolean } = {}) => {
  const {
    data,
    isLoading: isLoadingCollection,
    error,
  } = useGetLibraryCollectionQuery(undefined, { skip });

  const maybeLibrary = useMemo(
    () => (isLibrary(data) ? data : undefined),
    [data],
  );

  return {
    isLoading: isLoadingCollection,
    data: maybeLibrary,
    error,
  };
};
