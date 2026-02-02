import { match } from "ts-pattern";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import type { Database, SchemaName, Table } from "metabase-types/api";

import {
  ItemList,
  type OmniPickerDatabaseItem,
  type OmniPickerItem,
  type OmniPickerSchemaItem,
  type OmniPickerTableItem,
} from "../..";

const createSchemaItem = (
  dbId: number,
  schema: SchemaName,
): OmniPickerSchemaItem => ({
  model: "schema",
  id: schema,
  name: schema,
  database_id: dbId,
});

const createDatabaseItem = (db: Database): OmniPickerDatabaseItem => ({
  ...db,
  model: "database",
});

const createTableItem = (table: Table): OmniPickerTableItem => ({
  ...table,
  name: table.display_name ?? table.name,
  database_id: table.db_id, // make the API consistent
  model: "table",
});

const useGetDbItemListData = (parentItem: OmniPickerItem) => {
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery(
    parentItem.id === "databases" ? undefined : skipToken,
  );

  const dbId = match(parentItem)
    .with({ model: "database" }, () => Number(parentItem.id))
    .with(
      { model: "schema" },
      () => (parentItem as OmniPickerSchemaItem).database_id,
    )
    .otherwise(() => undefined);

  const {
    data: schemas,
    isLoading: isLoadingSchemas,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    parentItem.model === "database" && !!dbId ? { id: dbId } : skipToken,
  );

  const schemaName: SchemaName | null =
    parentItem.model === "schema"
      ? String(parentItem.id)
      : schemas?.length === 1
        ? schemas[0] // if there's one schema, go straight to tables
        : null;

  const {
    data: tables,
    isLoading: isLoadingTables,
    error: tablesError,
  } = useListDatabaseSchemaTablesQuery(
    schemaName !== null && !!dbId
      ? {
          id: dbId,
          schema: schemaName,
        }
      : skipToken,
  );

  return {
    data:
      tables?.map(createTableItem) ??
      (dbId
        ? schemas?.map((schema) => createSchemaItem(dbId, schema))
        : undefined) ??
      databases?.data?.map(createDatabaseItem),
    isLoading: isLoadingTables || isLoadingSchemas || isLoadingDatabases,
    error: tablesError || schemasError || databasesError,
  };
};

export const DbItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerItem;
  pathIndex: number;
}) => {
  const { data, error, isLoading } = useGetDbItemListData(parentItem);

  return (
    <ItemList
      items={data}
      pathIndex={pathIndex}
      isLoading={isLoading}
      error={error}
    />
  );
};
