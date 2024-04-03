import { useCallback, useEffect, useMemo, useState } from "react";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { AutoScrollBox } from "../../EntityPicker";
import type {
  NotebookDataPickerFolderItem,
  NotebookDataPickerValueItem,
  TablePickerValue,
} from "../types";
import { generateKey, getDbItem, getSchemaItem, getTableItem } from "../utils";

import { DatabaseList } from "./DatabaseList";
import { SchemaList } from "./SchemaList";
import { TableList } from "./TableList";

interface Props {
  value: TablePickerValue | null;
  onItemSelect: (item: NotebookDataPickerValueItem) => void;
}

export const TablePicker = ({ value, onItemSelect }: Props) => {
  const [dbId, setDbId] = useState<DatabaseId | undefined>(value?.db_id);
  const [schemaId, setSchemaId] = useState<SchemaId | undefined>(value?.schema); // TODO schemaId -> schemaName
  const [tableId, setTableId] = useState<TableId | undefined>(value?.id);

  const {
    data: databases,
    error: errorDatabases,
    isFetching: isLoadingDatabases,
  } = useListDatabasesQuery({ saved: false });

  const {
    data: schemas,
    error: errorSchemas,
    isFetching: isLoadingSchemas,
  } = useListDatabaseSchemasQuery(isNotNull(dbId) ? { id: dbId } : skipToken);

  const {
    data: tables,
    error: errorTables,
    isFetching: isLoadingTables,
  } = useListDatabaseSchemaTablesQuery(
    isNotNull(dbId) && isNotNull(schemaId)
      ? { id: dbId, schema: schemaId }
      : skipToken,
  );

  const selectedDbItem = useMemo(
    () => getDbItem(databases?.data, dbId),
    [databases, dbId],
  );

  const selectedSchemaItem = useMemo(() => getSchemaItem(schemaId), [schemaId]);

  const selectedTableItem = useMemo(
    () => getTableItem(tables, tableId),
    [tables, tableId],
  );

  const handleFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerFolderItem }) => {
      if (folder.model === "database") {
        if (dbId === folder.id) {
          setSchemaId(schemas?.length === 1 ? schemas[0] : undefined);
        } else {
          setDbId(folder.id);
          setSchemaId(undefined);
        }
        setTableId(undefined);
      }

      if (folder.model === "schema") {
        setSchemaId(folder.id);
        setTableId(undefined);
      }
    },
    [dbId, schemas],
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
          databases={isLoadingDatabases ? undefined : databases?.data}
          error={errorDatabases}
          isCurrentLevel={!schemaId || (schemas?.length === 1 && !tableId)}
          isLoading={isLoadingDatabases}
          selectedItem={selectedDbItem}
          onClick={folder => handleFolderSelect({ folder })}
        />

        {isNotNull(dbId) && (
          <SchemaList
            error={errorSchemas}
            isCurrentLevel={!tableId}
            isLoading={isLoadingSchemas}
            schemas={isLoadingSchemas ? undefined : schemas}
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
            tables={isLoadingTables ? undefined : tables}
            onClick={handleItemSelect}
          />
        )}
      </Flex>
    </AutoScrollBox>
  );
};
