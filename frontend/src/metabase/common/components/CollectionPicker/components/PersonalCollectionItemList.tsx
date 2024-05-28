import { useMemo } from "react";

import { useListCollectionsQuery } from "metabase/api";
import type { Collection } from "metabase-types/api";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

export const PersonalCollectionsItemList = ({
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
}: CollectionItemListProps) => {
  const {
    data: collections,
    error,
    isLoading,
  } = useListCollectionsQuery({
    "personal-only": true,
  });

  const topLevelPersonalCollections = useMemo(
    () => getSortedTopLevelPersonalCollections(collections),
    [collections],
  );

  return (
    <ItemList
      items={topLevelPersonalCollections}
      error={error}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
      shouldShowItem={shouldShowItem}
    />
  );
};

const getSortedTopLevelPersonalCollections = (
  personalCollections?: Collection[],
): CollectionPickerItem[] | null =>
  personalCollections
    ?.filter(isRootPersonalCollection)
    .map(
      (collection: Collection): CollectionPickerItem => ({
        ...collection,
        here: ["collection"], // until this endpoint gives this to us, pretend they all have content
        model: "collection",
      }),
    )
    .sort((a, b) => a?.name.localeCompare(b.name)) ?? null;

// the search api lacks `personal_owner_id` field, so we need this check to be different
// than when checking this elsewhere
const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === "/";
