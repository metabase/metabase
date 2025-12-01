import { useMemo } from "react";

import type { Database } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";

import type { TablePickerFolderItem } from "./types";

interface Props {
  databases: Database[] | undefined;
  error: unknown;
  isCurrentLevel: boolean;
  isLoading: boolean;
  selectedItem: TablePickerFolderItem | null;
  onClick: (item: TablePickerFolderItem) => void;
  shouldDisableItem?: (item: TablePickerFolderItem) => boolean;
}

const isFolder = () => true;

export const DatabaseList = ({
  databases,
  error,
  isCurrentLevel,
  isLoading,
  selectedItem,
  onClick,
  shouldDisableItem,
}: Props) => {
  const items: TablePickerFolderItem[] | undefined = useMemo(() => {
    return databases?.map((database) => ({
      id: database.id,
      model: "database",
      name: database.name,
      database,
    }));
  }, [databases]);

  const hasOnly1Item = items?.length === 1;

  if (!isLoading && !error && hasOnly1Item) {
    return null;
  }

  return (
    <ListBox data-testid="item-picker-level-0">
      <ItemList
        error={error}
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        isLoading={isLoading}
        items={items}
        selectedItem={selectedItem}
        onClick={onClick}
        shouldDisableItem={(item) => shouldDisableItem?.(item) || false}
      />
    </ListBox>
  );
};
