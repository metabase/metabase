import { useMemo } from "react";
import type { CollectionItem, Collection } from "metabase-types/api";
import { useCollectionListQuery } from "metabase/common/hooks";
import type { EntityPickerOptions } from "../../types";
import { ItemList } from "./ItemList";

interface PersonalCollectionsItemListProps {
  onClick: (val: CollectionItem) => void;
  selectedItem: CollectionItem | null;
  folderModel: string;
  options: EntityPickerOptions;
}

export const PersonalCollectionsItemList = ({
  onClick,
  selectedItem,
  folderModel,
}: PersonalCollectionsItemListProps) => {
  // TODO: see if we can make personal-only flag faster
  const { data: collections, isLoading } = useCollectionListQuery();

  const topLevelPersonalCollections = useMemo(() =>
    getSortedTopLevelPersonalCollections(collections)
  , [collections]);

  return (
    <ItemList
      items={topLevelPersonalCollections}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      folderModel={folderModel}
    />
  );
};

const getSortedTopLevelPersonalCollections = (personalCollections?: Collection[]) =>
  personalCollections
    ?.filter(isRootPersonalCollection)
    .map((collection: Collection) => ({
      ...collection,
      model: 'collection',
    }) as unknown as CollectionItem)
    .sort((a,b) => a?.name.localeCompare(b.name)) ?? [];

const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === '/';
