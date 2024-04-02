import { skipToken } from "@reduxjs/toolkit/dist/query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import {
  AutoScrollBox,
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

export const TablePicker = ({ onItemSelect, value }: Props) => {
  const [dbId, setDbId] = useState<DatabaseId | undefined>(value?.db_id);
  const [schemaId, setSchemaId] = useState<SchemaId | undefined>(value?.schema);
  const [tableId, setTableId] = useState<TableId | undefined>(value?.id);

  const {
    data: databases,
    error: errorDatabases,
    isLoading: isLoadingDatabases,
  } = useListDatabasesQuery({ saved: false });

  const {
    data: schemas,
    error: errorSchemas,
    isLoading: isLoadingSchemas,
  } = useListDatabaseSchemasQuery(isNotNull(dbId) ? { id: dbId } : skipToken); // TODO conditional type

  const {
    data: tables,
    error: errorTables,
    isLoading: isLoadingTables,
  } = useListDatabaseSchemaTablesQuery(
    isNotNull(schemaId) && isNotNull(dbId)
      ? { id: dbId, schema: schemaId }
      : skipToken,
  );

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

  useEffect(() => {
    if (databases?.data.length === 1) {
      const [database] = databases.data;
      setDbId(database.id);
    }
  }, [databases]);

  useEffect(() => {
    if (schemas?.length === 1) {
      const [schema] = schemas;
      setSchemaId(schema);
    }
  }, [schemas]);

  return (
    <AutoScrollBox
      contentHash={generateKey(
        selectedDbItem,
        selectedSchemaItem,
        selectedTableItem,
      )}
      data-testid="nested-item-picker"
    >
      <Flex h="100%" w="fit-content">
        <DatabaseList
          databases={databases?.data}
          error={errorDatabases}
          isCurrentLevel={!schemaId}
          isLoading={isLoadingDatabases}
          selectedItem={selectedDbItem}
          onClick={folder => handleFolderSelect({ folder })}
        />

        {isNotNull(dbId) && (
          <SchemaList
            error={errorSchemas}
            isCurrentLevel={!tableId}
            isLoading={isLoadingSchemas}
            schemas={schemas}
            selectedItem={selectedSchemaItem}
            onClick={folder => handleFolderSelect({ folder })}
          />
        )}

        {isNotNull(schemaId) && (
          <TableList
            error={errorTables}
            isCurrentLevel
            isLoading={isLoadingTables}
            selectedItem={selectedTableItem}
            tables={tables}
            onClick={handleItemSelect}
          />
        )}
      </Flex>
    </AutoScrollBox>
  );
};
