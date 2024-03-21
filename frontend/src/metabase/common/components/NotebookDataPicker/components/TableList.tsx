import { useTableListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
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
  onClick: (val: NotebookDataPickerItem) => void;
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
