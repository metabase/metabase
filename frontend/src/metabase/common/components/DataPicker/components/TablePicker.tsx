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
  DataPickerFolderItem,
  DataPickerItem,
  DataPickerValueItem,
  TablePickerStatePath,
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
  path: TablePickerStatePath | undefined;
  value: TablePickerValue | undefined;
  onItemSelect: (value: DataPickerItem) => void;
  onPathChange: (path: TablePickerStatePath) => void;
}

export const TablePicker = ({
  databaseId,
  path,
  value,
  onItemSelect,
  onPathChange,
}: Props) => {
  const defaultPath = useMemo<TablePickerStatePath>(() => {
    return [databaseId ?? value?.db_id, value?.schema, value?.id];
  }, [databaseId, value]);
  const [initialDbId, initialSchemaId, initialTableId] = path ?? defaultPath;
  const [dbId, setDbId] = useState<DatabaseId | undefined>(initialDbId);
  const [schemaName, setSchemaName] = useState<SchemaName | undefined>(
    initialSchemaId,
  );
  const [tableId, setTableId] = useState<TableId | undefined>(initialTableId);

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
    (folder: DataPickerFolderItem) => {
      if (folder.model === "database") {
        if (dbId === folder.id) {
          const newSchemaName = schemas?.length === 1 ? schemas[0] : undefined;
          const newPath: TablePickerStatePath = [
            dbId,
            newSchemaName,
            undefined,
          ];
          setSchemaName(newSchemaName);
          onItemSelect(folder);
          onPathChange(newPath);
        } else {
          const newPath: TablePickerStatePath = [
            folder.id,
            undefined,
            undefined,
          ];
          setDbId(folder.id);
          setSchemaName(undefined);
          onItemSelect(folder);
          onPathChange(newPath);
        }
      }

      if (folder.model === "schema") {
        const newPath: TablePickerStatePath = [dbId, folder.id, undefined];
        setSchemaName(folder.id);
        onItemSelect(folder);
        onPathChange(newPath);
      }

      setTableId(undefined);
    },
    [dbId, schemas, onItemSelect, onPathChange],
  );

  const handleTableSelect = useCallback(
    (item: DataPickerValueItem) => {
      setTableId(item.id);
      onItemSelect(item);
      onPathChange([dbId, schemaName, item.id]);
    },
    [dbId, schemaName, setTableId, onItemSelect, onPathChange],
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
            onClick={handleFolderSelect}
          />
        )}

        {isNotNull(dbId) && (
          <SchemaList
            error={errorSchemas}
            isCurrentLevel={!tableId}
            isLoading={isLoadingSchemas}
            schemas={isLoadingSchemas ? undefined : schemas}
            selectedItem={selectedSchemaItem}
            onClick={handleFolderSelect}
          />
        )}

        {isNotNull(schemaName) && (
          <TableList
            error={errorTables}
            isCurrentLevel
            isLoading={isLoadingTables}
            selectedItem={selectedTableItem}
            tables={isLoadingTables ? undefined : tables}
            onClick={handleTableSelect}
          />
        )}
      </Flex>
    </AutoScrollBox>
  );
};
