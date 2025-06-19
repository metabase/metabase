import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLatest } from "react-use";

import {
  skipToken,
  useListActionsV2Query,
  useListDatabaseTablesWithActionsQuery,
  useListDatabasesWithActionsQuery,
} from "metabase/api";
import { getSchemaItem } from "metabase/common/components/DataPicker";
import { DatabaseList } from "metabase/common/components/DataPicker/components/DatabaseList";
import { SchemaList } from "metabase/common/components/DataPicker/components/SchemaList";
import { TableList } from "metabase/common/components/DataPicker/components/TableList";
import type { ActionItem } from "metabase/common/components/DataPicker/types";
import { AutoScrollBox } from "metabase/common/components/EntityPicker";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import type {
  DataGridWritebackActionId,
  Database,
  DatabaseId,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

import { ActionList } from "./ActionList";
import type {
  TableActionPickerFolderItem,
  TableActionPickerItem,
  TableActionPickerStatePath,
} from "./types";
import {
  generateTableActionKey,
  getActionItem,
  getDbItem,
  getTableItem,
} from "./utils";

const isTableFolder = () => true;

interface Props {
  path: TableActionPickerStatePath | undefined;
  onItemSelect: (value: TableActionPickerItem) => void;
  onPathChange: (path: TableActionPickerStatePath) => void;
  children?: ReactNode;
}

export const TableActionPicker = ({
  path,
  onItemSelect,
  onPathChange,
  children,
}: Props) => {
  const [initialDbId, initialSchemaId, initialTableId, initialActionId] =
    path ?? [undefined, undefined, undefined, undefined];
  const [dbId, setDbId] = useState<DatabaseId | undefined>(initialDbId);
  const [schemaName, setSchemaName] = useState<SchemaName | undefined>(
    initialSchemaId,
  );
  const [tableId, setTableId] = useState<TableId | undefined>(initialTableId);
  const [actionId, setActionId] = useState<
    DataGridWritebackActionId | undefined
  >(initialActionId);

  const {
    data: databasesResponse,
    error: errorDatabases,
    isFetching: isLoadingDatabases,
  } = useListDatabasesWithActionsQuery();

  const databases = isLoadingDatabases
    ? undefined
    : databasesResponse?.databases;

  const {
    data: tablesResponse,
    error: errorTables,
    isFetching: isLoadingTables,
  } = useListDatabaseTablesWithActionsQuery(
    isNotNull(dbId) ? { id: dbId } : skipToken,
  );

  const allTables = isLoadingDatabases ? undefined : tablesResponse?.tables;

  const schemas = useMemo(() => {
    const addedItemsSet = new Set<string>();

    allTables?.forEach(({ schema }) => {
      if (!addedItemsSet.has(schema)) {
        addedItemsSet.add(schema);
      }
    });

    return Array.from(addedItemsSet);
  }, [allTables]);

  const tables = useMemo(() => {
    return allTables?.filter(({ schema: itemSchemaName }) => {
      return itemSchemaName === schemaName;
    });
  }, [allTables, schemaName]);

  const {
    data: actionsResponse,
    error: errorActions,
    isFetching: isLoadingActions,
  } = useListActionsV2Query(
    isNotNull(tableId) ? { "table-id": tableId } : skipToken,
  );
  const actions = isLoadingActions ? undefined : actionsResponse?.actions;

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

  const selectedActionItem = useMemo(
    () => getActionItem(actions, actionId),
    [actions, actionId],
  );

  const handleFolderSelect = useCallback(
    (folder: TableActionPickerFolderItem) => {
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
          const newPath: TableActionPickerStatePath = [
            dbId,
            newSchemaName,
            undefined,
            undefined,
          ];
          setSchemaName(newSchemaName);
          onPathChange(newPath);
          onItemSelect(newSchemaItem ?? folder);
        } else {
          const newPath: TableActionPickerStatePath = [
            folder.id,
            undefined,
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
        const newPath: TableActionPickerStatePath = [
          dbId,
          folder.id,
          undefined,
          undefined,
        ];
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

      if (folder.model === "table") {
        setTableId(folder.id);
        onItemSelect(folder);
        onPathChange([dbId, schemaName, folder.id, undefined]);
      }

      setActionId(undefined);
    },
    [dbId, schemas, onPathChange, onItemSelect, selectedDbItem, schemaName],
  );

  const handleActionSelect = useCallback(
    (item: ActionItem) => {
      setActionId(item.id);
      onItemSelect(item);
      onPathChange([dbId, schemaName, tableId, item.id]);
    },
    [onItemSelect, onPathChange, dbId, schemaName, tableId],
  );

  const onItemSelectRef = useLatest(onItemSelect);
  const handleFolderSelectRef = useLatest(handleFolderSelect);

  useEffect(
    function ensureDbSelected() {
      const hasDbs = !isLoadingDatabases && databases && databases.length > 0;

      if (hasDbs && !selectedDbItem) {
        const firstDatabase = databases[0];
        const item = getDbItem(databases, firstDatabase.id);

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
    ],
  );

  useEffect(
    function ensureSchemaSelected() {
      const hasSchemas = !isLoadingTables && schemas && schemas.length > 0;

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
      isLoadingTables,
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
    <AutoScrollBox
      contentHash={generateTableActionKey(
        selectedDbItem,
        selectedSchemaItem,
        selectedTableItem,
        selectedActionItem,
      )}
      data-testid="nested-item-picker"
    >
      <Flex h="100%" w="fit-content">
        <DatabaseList
          databases={databases as Database[] | undefined}
          error={errorDatabases}
          isCurrentLevel={
            schemaName == null || (schemas?.length === 1 && !tableId)
          }
          isLoading={isLoadingDatabases}
          selectedItem={selectedDbItem}
          onClick={handleFolderSelect}
        />

        {isNotNull(dbId) && (
          <SchemaList
            dbId={dbId}
            dbName={selectedDbItem?.name}
            error={errorTables}
            isCurrentLevel={!tableId}
            isLoading={isLoadingTables}
            schemas={isLoadingTables ? undefined : schemas}
            selectedItem={selectedSchemaItem}
            onClick={handleFolderSelect}
          />
        )}

        {isNotNull(schemaName) && (
          <TableList
            error={errorTables}
            isCurrentLevel={!actionId}
            isLoading={isLoadingTables}
            selectedItem={selectedTableItem}
            tables={
              isLoadingTables ? undefined : (tables as Table[] | undefined)
            }
            isFolder={isTableFolder}
            onClick={handleFolderSelect}
          />
        )}

        {isNotNull(tableId) && (
          <ActionList
            error={errorActions}
            isCurrentLevel
            isLoading={isLoadingActions}
            selectedItem={selectedActionItem}
            actions={isLoadingActions ? undefined : actions}
            onClick={handleActionSelect}
          />
        )}

        {children}
      </Flex>
    </AutoScrollBox>
  );
};
