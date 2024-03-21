import { useSchemaListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
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
  onClick: (val: NotebookDataPickerItem) => void;
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

  const items: NotebookDataPickerItem[] = schemas.map(table => ({
    id: table.id,
    model: "table",
    name: table.displayName() ?? table.name,
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
