import { useMemo } from "react";

import type { Table } from "metabase-types/api";

import { ItemList, ListBox } from "../../../EntityPicker";
import type { DataPickerValueItem } from "../types";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: DataPickerValueItem | null;
  tables: Table[] | undefined;
  onClick: (item: DataPickerValueItem) => void;
  shouldDisableItem?: (item: DataPickerValueItem) => boolean;
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
  const items: DataPickerValueItem[] | undefined = useMemo(() => {
    return tables?.map((table) => ({
      id: table.id,
      model: "table",
      name: table.display_name,
      database: { id: table.db_id },
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
        shouldDisableItem={shouldDisableItem}
      />
    </ListBox>
  );
};
