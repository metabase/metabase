import type { Ref } from "react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type {
  DatabaseId,
  SchemaId,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

import {
  NestedItemPicker,
  type EntityPickerModalOptions,
} from "../../EntityPicker";
import type {
  NotebookDataPickerItem,
  NotebookDataPickerModel,
  NotebookDataPickerValueItem,
  PathEntry,
} from "../types";
import { generateKey, isFolder } from "../utils";

import { DataPickerListResolver } from "./DataPickerListResolver";
// import { getCollectionIdPath, isFolder } from "./utils";

const defaultOptions: EntityPickerModalOptions = {};

interface Props {
  value: Table | null;
  options?: EntityPickerModalOptions;
  onItemSelect: (item: NotebookDataPickerValueItem) => void;
}

const generatePath = (
  dbId: DatabaseId | undefined,
  schemaName: SchemaName | undefined,
  tableId: TableId | undefined,
) => {
  const path: PathEntry<NotebookDataPickerModel> = [
    {
      model: "database",
      query: { saved: false },
      selectedItem: dbId
        ? {
            model: "database",
            id: dbId,
            name: "", // TODO
          }
        : null,
    },
  ];

  if (dbId != null) {
    path.push({
      model: "schema",
      query: { dbId },
      selectedItem: schemaName
        ? {
            model: "schema",
            id: schemaName,
            name: "", // TODO
          }
        : null,
    });
  }

  if (schemaName != null) {
    path.push({
      model: "table",
      query: { dbId, schemaName },
      selectedItem: tableId
        ? {
            model: "table",
            id: tableId,
            name: "", // TODO
          }
        : null,
    });
  }

  return path;
};

export const TablePicker = forwardRef(function TablePicker(
  { onItemSelect, value, options = defaultOptions }: Props,
  ref: Ref<unknown>,
) {
  const [dbId, setDbId] = useState<DatabaseId | undefined>(value?.db_id);
  const [schemaId, setSchemaId] = useState<SchemaId | undefined>(value?.schema);
  const [tableId, setTableId] = useState<TableId | undefined>(value?.id);

  const path = useMemo(
    () => generatePath(dbId, schemaId, tableId),
    [dbId, schemaId, tableId],
  );

  const handleFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerItem }) => {
      if (folder.model === "database") {
        setDbId(folder.id);
        setSchemaId(undefined);
        setTableId(undefined);
      }

      if (folder.model === "schema") {
        setSchemaId(getSchemaName(folder.id));
        setTableId(undefined);
      }
    },
    [setDbId, setSchemaId, setTableId],
  );

  const handleItemSelect = useCallback(
    (item: NotebookDataPickerItem) => {
      setTableId(item.id);
    },
    [setTableId],
  );

  // Exposing handleFolderSelect so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      handleFolderSelect,
    }),
    [handleFolderSelect],
  );

  return (
    <NestedItemPicker
      generateKey={generateKey}
      isFolder={isFolder}
      itemName={t`table`}
      listResolver={DataPickerListResolver}
      options={options}
      path={path}
      onFolderSelect={handleFolderSelect}
      onItemSelect={handleItemSelect}
    />
  );
});
