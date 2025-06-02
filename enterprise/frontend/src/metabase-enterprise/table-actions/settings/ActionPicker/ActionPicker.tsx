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
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { DatabaseList } from "metabase/common/components/DataPicker/components/DatabaseList";
import { SchemaList } from "metabase/common/components/DataPicker/components/SchemaList";
import { TableList } from "metabase/common/components/DataPicker/components/TableList";
import type {
  ActionItem,
  ActionPickerFolderItem,
  ActionPickerItem,
  ActionPickerStatePath,
  ActionPickerValue,
} from "metabase/common/components/DataPicker/types";
import {
  generateKey,
  getDbItem,
  getSchemaItem,
  getTableItem,
} from "metabase/common/components/DataPicker/utils";
import { AutoScrollBox } from "metabase/common/components/EntityPicker";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import { useGetActionsQuery } from "metabase-enterprise/api";
import { ActionList } from "metabase-enterprise/table-actions/settings/ActionPicker/ActionList";
import { getActionItem } from "metabase-enterprise/table-actions/settings/ActionPicker/utils";
import type {
  DataGridWritebackActionId,
  DatabaseId,
  SchemaName,
  TableAction,
  TableId,
} from "metabase-types/api";

interface Props {
  databaseId?: DatabaseId;
  path: ActionPickerStatePath | undefined;
  value: ActionPickerValue | undefined;
  onItemSelect: (value: ActionPickerItem) => void;
  onPathChange: (path: ActionPickerStatePath) => void;
  children?: ReactNode;
}

export const ActionPicker = ({
  databaseId,
  path,
  value,
  onItemSelect,
  onPathChange,
  children,
}: Props) => {
  const defaultPath = useMemo<ActionPickerStatePath>(() => {
    return [
      databaseId ?? value?.db_id,
      value?.schema,
      value?.table_id,
      value?.id,
    ];
  }, [databaseId, value]);
  const [initialDbId, initialSchemaId, initialTableId, initialActionId] =
    path ?? defaultPath;
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

  // TODO: load by table
  const {
    data: allActions,
    error: errorActions,
    isFetching: isLoadingActions,
  } = useGetActionsQuery(isNotNull(tableId) ? undefined : skipToken);
  const actions = useMemo(
    () =>
      allActions?.filter((action) => {
        // if (actionTarget?.model === "dataset") {
        //   return (action as WritebackAction).model_id === actionTarget.id;
        // }
        // if (actionTarget?.model === "table") {
        return (action as TableAction).table_id === tableId;
        // }
      }) || [],
    [allActions, tableId],
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

  const selectedActionItem = useMemo(
    () => getActionItem(actions, actionId),
    [actions, actionId],
  );

  const handleFolderSelect = useCallback(
    (folder: ActionPickerFolderItem) => {
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
          const newPath: ActionPickerStatePath = [
            dbId,
            newSchemaName,
            undefined,
            undefined,
          ];
          setSchemaName(newSchemaName);
          onPathChange(newPath);
          onItemSelect(newSchemaItem ?? folder);
        } else {
          const newPath: ActionPickerStatePath = [
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
        const newPath: ActionPickerStatePath = [
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
            isCurrentLevel={!actionId}
            isLoading={isLoadingTables}
            selectedItem={selectedTableItem}
            tables={isLoadingTables ? undefined : tables}
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
