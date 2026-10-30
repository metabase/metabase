import { useCallback, useEffect, useState } from "react";

import type { CollectionId, CollectionItemModel } from "metabase-types/api";

export type CollectionTypeFilterState = {
  selectedFilters: CollectionItemModel[] | null;
  setSelectedFilters: (filters: CollectionItemModel[] | null) => void;
};

/** The item types the collection items list is filtered to; `null` lists
 * every type. Resets when the collection changes. */
export const useCollectionTypeFilter = (
  collectionId: CollectionId | undefined,
): CollectionTypeFilterState => {
  const [filterSelection, setFilterSelection] = useState<{
    collectionId?: CollectionId;
    value: CollectionItemModel[] | null;
  }>({ collectionId, value: null });

  useEffect(() => {
    setFilterSelection({ collectionId, value: null });
  }, [collectionId]);

  const setSelectedFilters = useCallback(
    (value: CollectionItemModel[] | null) =>
      setFilterSelection({ collectionId, value }),
    [collectionId],
  );

  return {
    // Keyed by collection, so another collection's selection never shows here
    selectedFilters:
      filterSelection.collectionId === collectionId
        ? filterSelection.value
        : null,
    setSelectedFilters,
  };
};
