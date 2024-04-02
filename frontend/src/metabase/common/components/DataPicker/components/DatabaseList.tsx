import { useMemo } from "react";

import type Database from "metabase-lib/v1/metadata/Database";

import { ItemList } from "../../EntityPicker";
import type { NotebookDataPickerFolderItem } from "../types";

interface Props {
  databases: Database[];
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
  const items: NotebookDataPickerFolderItem[] = useMemo(() => {
    return databases.map(database => ({
      description: database.description,
      id: database.id,
      model: "database",
      name: database.displayName(),
    }));
  }, [databases]);

  return (
    <ItemList
      error={error}
      isCurrentLevel={isCurrentLevel}
      isFolder={isFolder}
      isLoading={isLoading}
      items={items}
      selectedItem={selectedItem}
      onClick={onClick}
    />
  );
};
