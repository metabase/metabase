import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import { PersonalCollectionsItemList } from "../../CollectionPicker/components/PersonalCollectionItemList";
import { RootItemList } from "../../CollectionPicker/components/RootItemList";
import { SearchItemList } from "../../CollectionPicker/components/SearchItemList";
import type { QuestionItemListProps } from "../types";

export const QuestionItemPickerResolver = ({
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
}: QuestionItemListProps) => {
  if (!query) {
    return (
      <RootItemList
        options={options}
        selectedItem={selectedItem}
        onClick={onClick}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
      />
    );
  }

  if (query.collection === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        options={options}
      />
    );
  }

  return (
    <SearchItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      options={options}
    />
  );
};
