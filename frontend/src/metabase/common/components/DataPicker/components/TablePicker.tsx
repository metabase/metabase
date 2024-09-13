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
    data: databasesResponse,
    error: errorDatabases,
    isFetching: isLoadingDatabases,
  } = useListDatabasesQuery({ saved: false });

  const databases = isLoadingDatabases ? undefined : databasesResponse?.data;

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
    () => getDbItem(databases, dbId),
    [databases, dbId],
  );

  const selectedSchemaItem = useMemo(
    () => getSchemaItem(dbId, schemaName),
    [dbId, schemaName],
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
    (item: DataPickerValueItem) => {
      setTableId(item.id);
      onItemSelect(item);
      onPathChange([dbId, schemaName, item.id]);
    },
    [dbId, schemaName, setTableId, onItemSelect, onPathChange],
  );

  const onItemSelectRef = useLatest(onItemSelect);
  const handleFolderSelectRef = useLatest(handleFolderSelect);

  useEffect(
    function ensureSchemaSelectedInMultiSchemaDb() {
      if (
        !isLoadingSchemas &&
        schemas &&
        schemas.length > 1 &&
        schemaName == null
      ) {
        const firstSchema = schemas[0];
        const item = getSchemaItem(dbId, firstSchema);

        if (item) {
          handleFolderSelectRef.current(item);
        }
      }
    },
    [dbId, isLoadingSchemas, schemas, schemaName, handleFolderSelectRef],
  );

  useEffect(
    function ensureFolderSelected() {
      if (initialDbId == null && databases && databases.length > 0) {
        const firstDatabase = databases[0];
        handleFolderSelectRef.current({
          id: firstDatabase.id,
          model: "database",
          name: firstDatabase.name,
        });
      }

      if (initialDbId != null) {
        const item =
          initialSchemaId == null || schemas?.length === 1
            ? getDbItem(databases, initialDbId)
            : getSchemaItem(initialDbId, initialSchemaId);

        if (item) {
          onItemSelectRef.current(item);
        }
      }
    },
    [
      databases,
      schemas,
      handleFolderSelectRef,
      onItemSelectRef,
      initialDbId,
      initialSchemaId,
    ],
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
            databases={databases}
            error={errorDatabases}
            isCurrentLevel={
              schemaName == null || (schemas?.length === 1 && !tableId)
            }
            isLoading={isLoadingDatabases}
            selectedItem={selectedDbItem}
            onClick={handleFolderSelect}
          />
        )}

        {isNotNull(dbId) && (
          <SchemaList
            dbId={dbId}
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
