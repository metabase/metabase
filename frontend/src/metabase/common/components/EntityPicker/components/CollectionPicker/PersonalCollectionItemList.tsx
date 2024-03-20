import { useMemo } from "react";

import { useCollectionListQuery } from "metabase/common/hooks";
import type {
  Collection,
  CollectionId,
  SearchModelType,
} from "metabase-types/api";

import type { TisFolder } from "../../types";
import { ItemList } from "../ItemList";

import type { CollectionPickerItem } from "./types";

interface PersonalCollectionsItemListProps {
  onClick: (value: CollectionPickerItem) => void;
  selectedItem: CollectionPickerItem | null;
  isFolder: TisFolder<CollectionId, SearchModelType, CollectionPickerItem>;
  isCurrentLevel: boolean;
}

export const PersonalCollectionsItemList = ({
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
}: PersonalCollectionsItemListProps) => {
  const {
    data: collections,
    error,
    isLoading,
  } = useCollectionListQuery({
    query: { "personal-only": true },
  });

  const topLevelPersonalCollections = useMemo(
    () =>
      getSortedTopLevelPersonalCollections(
        collections,
      ) as unknown as CollectionPickerItem[], // TODO
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
        model: "collection",
      }),
    )
    .sort((a, b) => a?.name.localeCompare(b.name)) ?? null;

// the search api lacks `personal_owner_id` field, so we need this check to be different
// than when checking this elsewhere
const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === "/";
