import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import type { EntityPickerOptions, TisFolder } from "../../types";
import {
  EntityItemList,
  ItemList,
  PersonalCollectionsItemList,
  type EntityItemListProps,
} from "../ItemList";

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
      <RootItemList
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

interface RootItemListProps {
  selectedItem: NotebookDataPickerItem | null;
  isFolder: TisFolder<NotebookDataPickerItem>;
  isCurrentLevel: boolean;
  onClick: (val: NotebookDataPickerItem) => void;
}

const RootItemList = ({
  isCurrentLevel,
  isFolder,
  selectedItem,
  onClick,
}: RootItemListProps) => {
  const {
    data: databases = [],
    error,
    isLoading,
  } = useDatabaseListQuery({
    query: { saved: false }, // saved questions are fetched in a separate tab
  });

  const items = databases.map((database): NotebookDataPickerItem => {
    return {
      description: database.description,
      id: database.id,
      model: "database",
      name: database.displayName(),
    };
  });

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  return (
    <ItemList
      isCurrentLevel={isCurrentLevel}
      isFolder={isFolder}
      isLoading={isLoading}
      items={items}
      selectedItem={selectedItem}
      onClick={onClick}
    />
  );
};
