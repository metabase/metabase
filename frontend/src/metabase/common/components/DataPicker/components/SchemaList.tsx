import { useMemo } from "react";

import type { SchemaName } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";
import { useAutoSelectOnlyItem } from "../hooks";
import type { NotebookDataPickerFolderItem } from "../types";
import { getSchemaDisplayName } from "../utils";

interface Props {
  error: unknown;
  isCurrentLevel: boolean;
  isLoading: boolean;
  schemas: SchemaName[] | undefined;
  selectedItem: NotebookDataPickerFolderItem | null;
  onClick: (item: NotebookDataPickerFolderItem) => void;
}

const isFolder = () => true;

export const SchemaList = ({
  error,
  isCurrentLevel,
  isLoading,
  schemas,
  selectedItem,
  onClick,
}: Props) => {
  const items: NotebookDataPickerFolderItem[] | undefined = useMemo(() => {
    return schemas?.map(schema => ({
      id: schema,
      model: "schema",
      name: getSchemaDisplayName(schema),
    }));
  }, [schemas]);

  const hasOnly1Item = useAutoSelectOnlyItem({
    disabled: Boolean(selectedItem),
    items,
    onChange: onClick,
  });

  if (!isLoading && !error && hasOnly1Item) {
    return null;
  }

  return (
    <ListBox data-testid="item-picker-level-1">
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
