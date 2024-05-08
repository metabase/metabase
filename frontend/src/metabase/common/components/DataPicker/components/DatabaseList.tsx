import { useMemo } from "react";

import type { Database } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";
import { useAutoSelectOnlyItem } from "../hooks";
import type { NotebookDataPickerFolderItem } from "../types";

interface Props {
  databases: Database[] | undefined;
  error: unknown;
  isCurrentLevel: boolean;
  isLoading: boolean;
  selectedItem: NotebookDataPickerFolderItem | null;
  onClick: (item: NotebookDataPickerFolderItem) => void;
}

const isFolder = () => true;

export const DatabaseList = ({
  databases,
  error,
  isCurrentLevel,
  isLoading,
  selectedItem,
  onClick,
}: Props) => {
  const items: NotebookDataPickerFolderItem[] | undefined = useMemo(() => {
    return databases?.map(database => ({
      id: database.id,
      model: "database",
      name: database.name,
    }));
  }, [databases]);

  const hasOnly1Item = useAutoSelectOnlyItem({
    disabled: Boolean(selectedItem),
    items,
    onChange: onClick,
  });

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
      />
    </ListBox>
  );
};
