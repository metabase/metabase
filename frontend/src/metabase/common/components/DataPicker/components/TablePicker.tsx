import { useCallback, useMemo, useState } from "react";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import type { DatabaseId, SchemaName, TableId } from "metabase-types/api";

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
  /**
   * Limit selection to a particular database
   */
  databaseId?: DatabaseId;
  value: TablePickerValue | undefined;
  onChange: (value: NotebookDataPickerValueItem) => void;
}

export const TablePicker = ({ databaseId, value, onChange }: Props) => {
  const [dbId, setDbId] = useState<DatabaseId | undefined>(
    databaseId ?? value?.db_id,
  );
  const [schemaName, setSchemaName] = useState<SchemaName | undefined>(
    value?.schema,
  );
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
    isNotNull(dbId) && isNotNull(schemaName)
      ? { id: dbId, schema: schemaName }
      : skipToken,
  );

  const selectedDbItem = useMemo(
    () => getDbItem(databases?.data, dbId),
    [databases, dbId],
  );

  const selectedSchemaItem = useMemo(
    () => getSchemaItem(schemaName),
    [schemaName],
  );

  const selectedTableItem = useMemo(
    () => getTableItem(tables, tableId),
    [tables, tableId],
  );

  const handleFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerFolderItem }) => {
      if (folder.model === "database") {
        if (dbId === folder.id) {
          setSchemaName(schemas?.length === 1 ? schemas[0] : undefined);
        } else {
          setDbId(folder.id);
          setSchemaName(undefined);
        }
        setTableId(undefined);
      }

      if (folder.model === "schema") {
        setSchemaName(folder.id);
        setTableId(undefined);
      }
    },
    [dbId, schemas],
  );

  const handleItemSelect = useCallback(
    (item: NotebookDataPickerValueItem) => {
      setTableId(item.id);
      onChange(item);
    },
    [setTableId, onChange],
  );

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
        {!databaseId && (
          <DatabaseList
            databases={isLoadingDatabases ? undefined : databases?.data}
            error={errorDatabases}
            isCurrentLevel={!schemaName || (schemas?.length === 1 && !tableId)}
            isLoading={isLoadingDatabases}
            selectedItem={selectedDbItem}
            onClick={folder => handleFolderSelect({ folder })}
          />
        )}

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

        {isNotNull(schemaName) && (
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
