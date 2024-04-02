import { useMemo } from "react";

import type Table from "metabase-lib/v1/metadata/Table";

import { ItemList } from "../../EntityPicker";
import type { NotebookDataPickerValueItem } from "../types";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: NotebookDataPickerValueItem | null;
  tables: Table[];
  onClick: (item: NotebookDataPickerValueItem) => void;
}

const isFolder = () => false;

export const TableList = ({
  error,
  isLoading,
  isCurrentLevel,
  selectedItem,
  tables,
  onClick,
}: Props) => {
  const items: NotebookDataPickerValueItem[] = useMemo(() => {
    return tables.map(table => ({
      description: table.description,
      id: table.id,
      model: "table",
      name: table.displayName(),
    }));
  }, [tables]);

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
