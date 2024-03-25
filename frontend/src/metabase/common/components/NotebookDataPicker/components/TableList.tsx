import { useTableListQuery } from "metabase/common/hooks";
import type { TableListQuery } from "metabase-types/api";

import { ItemList, type IsFolder } from "../../EntityPicker";
import type { NotebookDataPickerItem } from "../types";

interface Props {
  isCurrentLevel: boolean;
  isFolder: IsFolder<
    NotebookDataPickerItem["id"],
    NotebookDataPickerItem["model"],
    NotebookDataPickerItem
  >;
  query: TableListQuery;
  selectedItem: NotebookDataPickerItem | null;
  onClick: (item: NotebookDataPickerItem) => void;
}

export const TableList = ({
  isCurrentLevel,
  isFolder,
  query,
  selectedItem,
  onClick,
}: Props) => {
  const { data: tables = [], error, isLoading } = useTableListQuery({ query });

  const items: NotebookDataPickerItem[] = tables.map(table => ({
    description: table.description,
    id: table.id,
    model: "table",
    name: table.displayName(),
  }));

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
