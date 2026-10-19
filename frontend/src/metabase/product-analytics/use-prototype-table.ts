import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId, DatabaseId, Table } from "metabase-types/api";

import { PROTOTYPE_DATABASE_NAME, PROTOTYPE_TABLE_NAME } from "./config";

const CLICKHOUSE_ENGINE = "clickhouse";

export type PrototypeTableResult = {
  table: Table | undefined;
  tableId: ConcreteTableId | undefined;
  /** The databases whose tables can be analyzed: the SQL is ClickHouse-only. */
  clickHouseDatabaseIds: DatabaseId[];
  isLoading: boolean;
  error: string | undefined;
};

export const usePrototypeTable = (): PrototypeTableResult => {
  const databases = useListDatabasesQuery();
  const database = databases.data?.data.find(
    (item) => item.name === PROTOTYPE_DATABASE_NAME,
  );

  const clickHouseDatabaseIds = (databases.data?.data ?? [])
    .filter((item) => item.engine === CLICKHOUSE_ENGINE)
    .map((item) => item.id);

  const tables = useListTablesQuery({ term: PROTOTYPE_TABLE_NAME });
  const table = tables.data?.find(
    (item) =>
      item.name === PROTOTYPE_TABLE_NAME &&
      (database === undefined || item.db_id === database.id),
  );
  const tableId = table && isConcreteTableId(table.id) ? table.id : undefined;

  const requestError = databases.error ?? tables.error;
  const error = requestError
    ? getErrorMessage(requestError)
    : databases.isSuccess && !database
      ? `No database named “${PROTOTYPE_DATABASE_NAME}”. Add the ClickHouse connection first.`
      : databases.isSuccess &&
          database &&
          tables.isSuccess &&
          tableId === undefined
        ? `No table named ${PROTOTYPE_TABLE_NAME} on ${PROTOTYPE_DATABASE_NAME}. Run 04_pa_events_resolved.sql and sync.`
        : undefined;

  return {
    table,
    tableId,
    clickHouseDatabaseIds,
    isLoading: databases.isLoading || tables.isLoading,
    error,
  };
};
