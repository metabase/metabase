import { useCallback, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import type { DatabaseId, SchemaName, TableId } from "metabase-types/api";

import { DatabaseList } from "./DatabaseList";
import { SchemaList } from "./SchemaList";
import { TableList } from "./TableList";
import type {
  TableItem,
  TablePickerFolderItem,
  TablePickerItem,
  TablePickerStatePath,
  TablePickerValue,
} from "./types";
import { getDbItem, getSchemaItem, getTableItem } from "./utils";

interface Props {
  /**
   * Limit selection to a particular database
   */
  databaseId?: DatabaseId;
  path?: TablePickerStatePath | undefined;
  value: TablePickerValue | undefined;
  onItemSelect: (value: TablePickerItem) => void;
  onPathChange: (path: TablePickerStatePath) => void;
  shouldDisableItem?: (item: TablePickerItem) => boolean;
}

export const TablePicker = ({
  databaseId,
  path,
  value,
  onItemSelect,
  onPathChange,
  shouldDisableItem,
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
    data: databasesResponse,
    error: errorDatabases,
    isFetching: isLoadingDatabases,
  } = useListDatabasesQuery({ saved: false, "can-query": true });

  const databases = isLoadingDatabases ? undefined : databasesResponse?.data;

  const {
    data: schemas,
    error: errorSchemas,
    isFetching: isLoadingSchemas,
  } = useListDatabaseSchemasQuery(
    isNotNull(dbId) ? { id: dbId, "can-query": true } : skipToken,
  );

  const {
    data: tables,
    error: errorTables,
    isFetching: isLoadingTables,
  } = useListDatabaseSchemaTablesQuery(
    isNotNull(dbId) && isNotNull(schemaName)
      ? { id: dbId, schema: schemaName, "can-query": true }
      : skipToken,
  );

  const selectedDbItem = useMemo(
    () => getDbItem(databases, dbId),
    [databases, dbId],
  );

  const selectedSchemaItem = useMemo(
    () =>
      getSchemaItem(
        dbId,
        selectedDbItem?.name,
        schemaName,
        schemas?.length === 1,
      ),
    [dbId, selectedDbItem, schemaName, schemas],
  );

  const selectedTableItem = useMemo(
    () => getTableItem(tables, tableId),
    [tables, tableId],
  );

  const handleFolderSelect = useCallback(
    (folder: TablePickerFolderItem) => {
      if (folder.model === "database") {
        if (dbId === folder.id) {
          const newSchemaName =
            schemas != null && schemas.length > 0 ? schemas[0] : undefined;
          const newSchemaItem = getSchemaItem(
            dbId,
            folder.name,
            newSchemaName,
            schemas?.length === 1,
          );
          const newPath: TablePickerStatePath = [
            dbId,
            newSchemaName,
            undefined,
          ];
          setSchemaName(newSchemaName);
          onPathChange(newPath);
          onItemSelect(newSchemaItem ?? folder);
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
        onItemSelect({
          ...folder,
          name:
            // use database name if there is only 1 schema, as user won't even see the schema in the UI
            selectedDbItem && schemas?.length === 1
              ? selectedDbItem.name
              : folder.name,
        });
        onPathChange(newPath);
      }

      setTableId(undefined);
    },
    [dbId, selectedDbItem, schemas, onItemSelect, onPathChange],
  );

  const handleTableSelect = useCallback(
    (item: TableItem) => {
      setTableId(item.id);
      onItemSelect(item);
      onPathChange([dbId, schemaName, item.id]);
    },
    [dbId, schemaName, setTableId, onItemSelect, onPathChange],
  );

  const onItemSelectRef = useLatest(onItemSelect);
  const handleFolderSelectRef = useLatest(handleFolderSelect);

  useEffect(
    function ensureDbSelected() {
      const hasDbs = !isLoadingDatabases && databases && databases.length > 0;

      if (hasDbs && !selectedDbItem) {
        const firstDatabase = shouldDisableItem
          ? databases.find(
              (db) => !shouldDisableItem({ ...db, model: "database" }),
            )
          : databases[0];

        const item = firstDatabase
          ? getDbItem(databases, firstDatabase.id)
          : undefined;

        if (item) {
          handleFolderSelectRef.current(item);
        }
      }
    },
    [
      dbId,
      isLoadingDatabases,
      databases,
      handleFolderSelectRef,
      selectedDbItem,
      shouldDisableItem,
    ],
  );

  useEffect(
    function ensureSchemaSelected() {
      const hasSchemas = !isLoadingSchemas && schemas && schemas.length > 0;

      if (hasSchemas && !selectedSchemaItem) {
        const firstSchema = schemas[0];
        const item = getSchemaItem(
          dbId,
          selectedDbItem?.name,
          firstSchema,
          schemas.length === 1,
        );

        if (item) {
          handleFolderSelectRef.current(item);
        }
      }
    },
    [
      dbId,
      selectedDbItem,
      isLoadingSchemas,
      schemas,
      handleFolderSelectRef,
      selectedSchemaItem,
    ],
  );

  useEffect(
    function ensureFolderSelected() {
      if (initialDbId != null) {
        const item = getSchemaItem(
          initialDbId,
          selectedDbItem?.name,
          initialSchemaId,
          schemas?.length === 1,
        );

        if (item) {
          onItemSelectRef.current(item);
        }
      }
    },
    [
      databases,
      schemas,
      selectedDbItem,
      onItemSelectRef,
      initialDbId,
      initialSchemaId,
    ],
  );

  return (
    <Flex h="100%" w="fit-content">
      {!databaseId && (
        <DatabaseList
          databases={databases}
          error={errorDatabases}
          isCurrentLevel={
            schemaName == null || (schemas?.length === 1 && !tableId)
          }
          isLoading={isLoadingDatabases}
          selectedItem={selectedDbItem}
          onClick={handleFolderSelect}
          shouldDisableItem={shouldDisableItem}
        />
      )}

      {isNotNull(dbId) && (
        <SchemaList
          dbId={dbId}
          dbName={selectedDbItem?.name}
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
          shouldDisableItem={shouldDisableItem}
        />
      )}
    </Flex>
  );
};
