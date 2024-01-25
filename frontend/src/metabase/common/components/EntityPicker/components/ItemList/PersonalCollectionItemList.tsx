import { useMemo } from "react";
import type { SearchResult, CollectionItem, Collection } from "metabase-types/api";
import { useCollectionListQuery } from "metabase/common/hooks";
import type { EntityPickerOptions, PickerItem } from "../../types";
import { ItemList } from "./ItemList";

interface PersonalCollectionsItemListProps {
  onClick: (val: PickerItem) => void;
  selectedItem: PickerItem | null;
  folderModel: string;
  options: EntityPickerOptions;
}

export const PersonalCollectionsItemList = ({
  onClick,
  selectedItem,
  folderModel,
}: PersonalCollectionsItemListProps) => {
  const { data: personalCollections, isLoading } = useCollectionListQuery({
    'personal-only': true,
  });
  console.log( 'personalCollections', personalCollections)
  const topLevelPersonalCollections = useMemo(() =>
    personalCollections
      ?.filter(isRootPersonalCollection)
      .sort((a,b) => a?.name.localeCompare(b.name)) ?? []
  , [personalCollections]);

  console.log( 'topLevelPersonalCollections', topLevelPersonalCollections)

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


const isRootPersonalCollection = (collection: Collection) =>
  collection.is_personal && collection.location === '/';
