import { useMemo } from "react";

import type { Table } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";
import type { NotebookDataPickerValueItem } from "../types";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: NotebookDataPickerValueItem | null;
  tables: Table[] | undefined;
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
  const items: NotebookDataPickerValueItem[] | undefined = useMemo(() => {
    return tables?.map(table => ({
      id: table.id,
      model: "table",
      name: table.display_name,
    }));
  }, [tables]);

  return (
    <ListBox data-testid="item-picker-level-2">
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
