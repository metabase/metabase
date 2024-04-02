import type { Ref } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

import {
  useDatabaseListQuery,
  useSchemaListQuery,
  useTableListQuery,
} from "metabase/common/hooks";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import {
  AutoScrollBox,
  ListBox,
  type EntityPickerModalOptions,
} from "../../EntityPicker";
import type {
  NotebookDataPickerFolderItem,
  NotebookDataPickerValueItem,
  Value,
} from "../types";
import { generateKey } from "../utils";

import { DatabaseList } from "./DatabaseList";
import { SchemaList } from "./SchemaList";
import { TableList } from "./TableList";

interface Props {
  value: Value | null;
  options?: EntityPickerModalOptions;
  onItemSelect: (item: NotebookDataPickerValueItem) => void;
}

export const TablePicker = forwardRef(function TablePicker(
  { onItemSelect, value }: Props,
  ref: Ref<unknown>,
) {
  const [dbId, setDbId] = useState<DatabaseId | undefined>(value?.db_id);
  const [schemaId, setSchemaId] = useState<SchemaId | undefined>(value?.schema);
  const [tableId, setTableId] = useState<TableId | undefined>(value?.id);

  const {
    data: databases = [],
    error: errorDatabases,
    isLoading: isLoadingDatabases,
  } = useDatabaseListQuery({ query: { saved: false } });

  const {
    data: schemas = [],
    error: errorSchemas,
    isLoading: isLoadingSchemas,
  } = useSchemaListQuery({ enabled: isNotNull(dbId), query: { dbId } }); // TODO conditional type

  const {
    data: tables = [],
    error: errorTables,
    isLoading: isLoadingTables,
  } = useTableListQuery({
    enabled: isNotNull(schemaId),
    query: { dbId, schemaName: schemaId },
  });

  const selectedDbItem = useMemo<NotebookDataPickerFolderItem | null>(() => {
    return isNotNull(dbId)
      ? { model: "database", id: dbId, name: "" } // TODO: name
      : null;
  }, [dbId]);

  const selectedSchemaItem =
    useMemo<NotebookDataPickerFolderItem | null>(() => {
      return isNotNull(schemaId)
        ? { model: "schema", id: schemaId, name: "" } // TODO: name
        : null;
    }, [schemaId]);

  const selectedTableItem = useMemo<NotebookDataPickerValueItem | null>(() => {
    return isNotNull(tableId)
      ? { model: "table", id: tableId, name: "" } // TODO: name
      : null;
  }, [tableId]);

  const handleFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerFolderItem }) => {
      if (folder.model === "database") {
        setDbId(folder.id);
        setSchemaId(undefined);
        setTableId(undefined);
      }

      if (folder.model === "schema") {
        setSchemaId(folder.id);
        setTableId(undefined);
      }
    },
    [],
  );

  const handleItemSelect = useCallback(
    (item: NotebookDataPickerValueItem) => {
      setTableId(item.id);
      onItemSelect(item);
    },
    [setTableId, onItemSelect],
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

  useEffect(() => {
    if (databases.length === 1) {
      const [database] = databases;
      setDbId(database.id);
    }
  }, [databases]);

  useEffect(() => {
    if (schemas.length === 1) {
      const [schema] = schemas;
      setSchemaId(schema.name);
    }
  }, [schemas]);

  return (
    <AutoScrollBox
      data-testid="nested-item-picker"
      contentHash={generateKey(
        selectedDbItem,
        selectedSchemaItem,
        selectedTableItem,
      )}
    >
      <Flex h="100%" w="fit-content">
        {databases.length > 1 && (
          <ListBox data-testid="item-picker-level-0">
            <DatabaseList
              databases={databases}
              error={errorDatabases}
              isCurrentLevel={!schemaId}
              isLoading={isLoadingDatabases}
              selectedItem={selectedDbItem}
              onClick={folder => handleFolderSelect({ folder })}
            />
          </ListBox>
        )}

        {isNotNull(dbId) && schemas.length > 1 && (
          <ListBox data-testid="item-picker-level-1">
            <SchemaList
              error={errorSchemas}
              isCurrentLevel={!tableId}
              isLoading={isLoadingSchemas}
              schemas={schemas}
              selectedItem={selectedSchemaItem}
              onClick={folder => handleFolderSelect({ folder })}
            />
          </ListBox>
        )}

        {isNotNull(schemaId) && (
          <ListBox data-testid="item-picker-level-2">
            <TableList
              error={errorTables}
              isCurrentLevel
              isLoading={isLoadingTables}
              selectedItem={selectedTableItem}
              tables={tables}
              onClick={handleItemSelect}
            />
          </ListBox>
        )}
      </Flex>
    </AutoScrollBox>
  );
});
