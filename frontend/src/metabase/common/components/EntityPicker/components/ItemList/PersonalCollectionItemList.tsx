import { useMemo } from "react";

import { useCollectionListQuery } from "metabase/common/hooks";
import type { Collection } from "metabase-types/api";

import type {
  TypeWithModel,
  TisFolder,
  CollectionPickerItem,
} from "../../types";

import { ItemList } from "./ItemList";

interface PersonalCollectionsItemListProps<TItem extends TypeWithModel> {
  onClick: (val: TItem) => void;
  selectedItem: TItem | null;
  isFolder: TisFolder<TItem>;
  isCurrentLevel: boolean;
}

export const PersonalCollectionsItemList = <TItem extends TypeWithModel>({
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
}: PersonalCollectionsItemListProps<TItem>) => {
  const { data: collections, isLoading } = useCollectionListQuery({
    query: { "personal-only": true },
  });

  const topLevelPersonalCollections = useMemo(
    () =>
      getSortedTopLevelPersonalCollections(collections) as unknown as TItem[],
    [collections],
  );

  return (
    <ItemList
      items={topLevelPersonalCollections}
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

const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === "/";
