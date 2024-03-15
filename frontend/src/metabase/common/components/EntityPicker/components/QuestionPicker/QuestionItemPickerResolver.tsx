import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { QuestionPickerItem, EntityPickerOptions } from "../../types";
import {
  RootItemList,
  PersonalCollectionsItemList,
  EntityItemList,
  type EntityItemListProps,
} from "../ItemList";

export const QuestionItemPickerResolver = ({
  onClick,
  selectedItem,
  options,
  query,
  isFolder,
  isCurrentLevel,
}: EntityItemListProps<QuestionPickerItem> & {
  options: EntityPickerOptions;
}) => {
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
      />
    );
  }

  return (
    <EntityItemList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
    />
  );
};
