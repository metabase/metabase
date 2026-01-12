import { useMemo } from "react";

import type { Table } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";

import type { TableItem } from "./types";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: TableItem | null;
  tables: Table[] | undefined;
  onClick: (item: TableItem) => void;
  shouldDisableItem?: (item: TableItem) => boolean;
}

const isFolder = () => false;

export const TableList = ({
  error,
  isLoading,
  isCurrentLevel,
  selectedItem,
  tables,
  onClick,
  shouldDisableItem,
}: Props) => {
  const items: TableItem[] | undefined = useMemo(() => {
    return tables?.map((table) => ({
      id: table.id,
      model: "table",
      name: table.display_name,
      database: { id: table.db_id },
      database_id: table.db_id,
      is_published: table.is_published,
    }));
  }, [tables]);

  return (
    <ListBox data-testid="item-picker-level-3">
      <ItemList
        error={error}
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        isLoading={isLoading}
        items={items}
        selectedItem={selectedItem}
        onClick={onClick}
        shouldDisableItem={shouldDisableItem}
      />
    </ListBox>
  );
};
