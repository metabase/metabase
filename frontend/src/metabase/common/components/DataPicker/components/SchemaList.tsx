import { useMemo } from "react";

import type Schema from "metabase-lib/v1/metadata/Schema";

import { ItemList } from "../../EntityPicker";
import type { NotebookDataPickerFolderItem } from "../types";

interface Props {
  error: unknown;
  isCurrentLevel: boolean;
  isLoading: boolean;
  schemas: Schema[];
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
  const items: NotebookDataPickerFolderItem[] = useMemo(() => {
    return schemas.map(schema => ({
      id: schema.name,
      model: "schema",
      name: schema.displayName() ?? schema.name,
    }));
  }, [schemas]);

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
