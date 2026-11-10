import { skipToken, useListCollectionItemsQuery } from "metabase/api";

import { useGetLibraryChildCollectionByType } from "../use-get-library-child-collection-by-type";

/**
 * Whether the Library's Data folder has any subfolders: without them, Data is
 * the only place a published table can go. `undefined` while loading.
 */
export function useHasDataSubfolders({
  skip = false,
}: { skip?: boolean } = {}) {
  const { data: dataCollection } = useGetLibraryChildCollectionByType({
    skip,
    type: "library-data",
  });
  const { data: subfolders, error } = useListCollectionItemsQuery(
    !skip && dataCollection != null
      ? { id: dataCollection.id, models: ["collection"], limit: 1 }
      : skipToken,
  );

  return {
    dataCollection,
    hasSubfolders: subfolders != null ? subfolders.total > 0 : undefined,
    error,
  };
}
