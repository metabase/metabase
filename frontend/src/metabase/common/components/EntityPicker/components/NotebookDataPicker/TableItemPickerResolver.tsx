import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { EntityPickerOptions } from "../../types";
import {
  EntityItemList,
  PersonalCollectionsItemList,
  type EntityItemListProps,
} from "../ItemList";

import { DatabaseList } from "./DatabaseList";
import type { NotebookDataPickerItem } from "./types";

export const TableItemPickerResolver = ({
  isCurrentLevel,
  isFolder,
  options,
  query,
  selectedItem,
  onClick,
}: EntityItemListProps<NotebookDataPickerItem> & {
  options: EntityPickerOptions;
}) => {
  if (!query) {
    return (
      <DatabaseList
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        selectedItem={selectedItem}
        onClick={onClick}
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
