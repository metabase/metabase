import { useSchemaListQuery } from "metabase/common/hooks";
import type { SchemaListQuery } from "metabase-types/api";

import { ItemList, type IsFolder } from "../../EntityPicker";
import type { NotebookDataPickerItem } from "../types";

interface Props {
  isCurrentLevel: boolean;
  isFolder: IsFolder<
    NotebookDataPickerItem["id"],
    NotebookDataPickerItem["model"],
    NotebookDataPickerItem
  >;
  query: SchemaListQuery;
  selectedItem: NotebookDataPickerItem | null;
  onClick: (item: NotebookDataPickerItem) => void;
}

export const SchemaList = ({
  isCurrentLevel,
  isFolder,
  query,
  selectedItem,
  onClick,
}: Props) => {
  const {
    data: schemas = [],
    error,
    isLoading,
  } = useSchemaListQuery({ query });

  const items: NotebookDataPickerItem[] = schemas.map(schema => ({
    id: schema.name,
    model: "schema",
    name: schema.displayName() ?? schema.name,
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
