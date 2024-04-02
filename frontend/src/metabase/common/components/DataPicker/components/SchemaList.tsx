import { useMemo } from "react";

import { humanize, titleize } from "metabase/lib/formatting";
import type { SchemaName } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";
import type { NotebookDataPickerFolderItem } from "../types";

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
      name: schema ? titleize(humanize(schema)) : "",
    }));
  }, [schemas]);

  if (!isLoading && !error && items && items.length <= 1) {
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
