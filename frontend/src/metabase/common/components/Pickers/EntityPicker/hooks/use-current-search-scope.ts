import { useMemo } from "react";

import { PLUGIN_LIBRARY } from "metabase/plugins";

import { useOmniPickerContext } from "../context";
import type { OmniPickerCollectionItem, SearchScope } from "../types";

type CollectionWithNumericId = OmniPickerCollectionItem & { id: number };

export const useGetLastCollection = ():
  | (CollectionWithNumericId & { id: number })
  | null => {
  const { previousPath } = useOmniPickerContext();

  const { data: libraryCollection } = PLUGIN_LIBRARY.useGetLibraryCollection();

  const lastCollection = useMemo(() => {
    const lastCollectionIndex = previousPath.findLastIndex(
      (item) => item.model === "collection",
    );
    return lastCollectionIndex !== -1
      ? (previousPath[lastCollectionIndex] as OmniPickerCollectionItem)
      : null;
  }, [previousPath]);

  return isValidScope(lastCollection, libraryCollection)
    ? lastCollection
    : null;
};

/**
 * gets the narrowed search scope for the currently selected collection, if it is selectable */
export const useCurrentSearchScope = (): SearchScope => {
  const { searchScope } = useOmniPickerContext();
  const { data: libraryCollection } = PLUGIN_LIBRARY.useGetLibraryCollection();

  const lastCollection = useGetLastCollection();

  if (searchScope || !lastCollection) {
    return searchScope;
  }

  if (lastCollection) {
    return lastCollection.id;
  }

  if (libraryCollection) {
    return libraryCollection.id;
  }

  return "all";
};

const isValidScope = (
  lastCollection: OmniPickerCollectionItem | null,
  libraryCollection?: OmniPickerCollectionItem,
): lastCollection is OmniPickerCollectionItem & { id: number } => {
  if (!lastCollection) {
    return false;
  }
  if (libraryCollection && lastCollection.id === libraryCollection.id) {
    // don't show library twice
    return false;
  }

  if (typeof lastCollection.id === "number") {
    return true;
  }

  if (lastCollection.id === "root" || lastCollection.id === null) {
    // scoped search doesn't work for our analytics
    return false;
  }

  if (lastCollection.id === "databases") {
    return true;
  }

  return false;
};
