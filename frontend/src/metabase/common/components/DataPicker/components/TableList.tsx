import { useMemo } from "react";

import type { Table } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";
import type { TableItem } from "../types";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: TableItem | null;
  tables: Table[] | undefined;
  isFolder?: () => boolean;
  onClick: (item: TableItem) => void;
}

const isFolder = () => false;

export const TableList = ({
  error,
  isLoading,
  isCurrentLevel,
  selectedItem,
  tables,
  isFolder: isFolderProp,
  onClick,
}: Props) => {
  const items: TableItem[] | undefined = useMemo(() => {
    return tables?.map((table) => ({
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
        isFolder={isFolderProp ?? isFolder}
        isLoading={isLoading}
        items={items}
        selectedItem={selectedItem}
        onClick={onClick}
      />
    </ListBox>
  );
};
