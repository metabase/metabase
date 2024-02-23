import { useMemo } from "react";

import { useCollectionListQuery } from "metabase/common/hooks";
import type { Collection } from "metabase-types/api";

import type { TypeWithModel, TisFolder } from "../../types";

import { ItemList } from "./ItemList";

interface PersonalCollectionsItemListProps<
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
> {
  onClick: (val: TItem | TFolder) => void;
  selectedItem: TItem | TFolder | null;
  itemName: string;
  isFolder: TisFolder<TItem, TFolder>;
  isCurrentLevel: boolean;
}

export const PersonalCollectionsItemList = <
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
>({
  onClick,
  selectedItem,
  itemName,
  isFolder,
  isCurrentLevel,
}: PersonalCollectionsItemListProps<TItem, TFolder>) => {
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
      itemName={itemName}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
    />
  );
};

const getSortedTopLevelPersonalCollections = (
  personalCollections?: Collection[],
) =>
  personalCollections
    ?.filter(isRootPersonalCollection)
    .map((collection: Collection) => ({
      ...collection,
      model: "collection",
    }))
    .sort((a, b) => a?.name.localeCompare(b.name)) ?? [];

const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === "/";
