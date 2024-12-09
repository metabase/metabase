import { useMemo } from "react";

import type { DatabaseId, SchemaName } from "metabase-types/api";

import { ItemList, ListBox } from "../../EntityPicker";
import type { DataPickerFolderItem } from "../types";
import { getSchemaDisplayName } from "../utils";

interface Props {
  dbId: DatabaseId;
  dbName: string | undefined;
  error: unknown;
  isCurrentLevel: boolean;
  isLoading: boolean;
  schemas: SchemaName[] | undefined;
  selectedItem: DataPickerFolderItem | null;
  onClick: (item: DataPickerFolderItem) => void;
}

const isFolder = () => true;

export const SchemaList = ({
  dbId,
  dbName,
  error,
  isCurrentLevel,
  isLoading,
  schemas,
  selectedItem,
  onClick,
}: Props) => {
  const items: DataPickerFolderItem[] | undefined = useMemo(() => {
    return schemas?.map(schema => ({
      id: schema,
      model: "schema",
      name: getSchemaDisplayName(schema),
      isOnlySchema: schemas.length === 1,
      dbName,
      dbId,
    }));
  }, [schemas, dbId, dbName]);

  const hasOnly1Item = items?.length === 1;

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
