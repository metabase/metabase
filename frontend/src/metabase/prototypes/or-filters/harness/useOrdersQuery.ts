import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import * as Lib from "metabase-lib";

const ORDERS_TABLE_NAME = "ORDERS";

type OrdersQueryState = {
  query: Lib.Query | undefined;
  isLoading: boolean;
  error: string | undefined;
};

/**
 * Sample Database → Orders, looked up by name so the ids can differ between
 * local and PR environments. `undefined` until metadata has loaded.
 */
export function useOrdersQuery(): OrdersQueryState {
  const databases = useListDatabasesQuery();
  const sampleDatabase = databases.data?.data.find((db) => db.is_sample);

  const tables = useListTablesQuery(
    sampleDatabase ? { dbId: sampleDatabase.id } : skipToken,
  );
  const ordersTable = tables.data?.find(
    (table) => table.name === ORDERS_TABLE_NAME,
  );

  const tableMetadata = useGetTableQueryMetadataQuery(
    ordersTable ? { id: ordersTable.id } : skipToken,
  );

  const metadataProvider = useMetadataProviderUnfiltered(
    sampleDatabase?.id ?? null,
  );

  const query = useMemo(() => {
    if (!ordersTable || !tableMetadata.isSuccess) {
      return undefined;
    }
    const table = Lib.tableOrCardMetadata(metadataProvider, ordersTable.id);
    return table
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, table)
      : undefined;
  }, [metadataProvider, ordersTable, tableMetadata.isSuccess]);

  const isLoading =
    databases.isLoading || tables.isLoading || tableMetadata.isLoading;

  const error = getError({
    databases,
    sampleDatabase,
    tables,
    ordersTable,
    tableMetadata,
  });

  return { query, isLoading, error };
}

type GetErrorOpts = {
  databases: ReturnType<typeof useListDatabasesQuery>;
  sampleDatabase: unknown;
  tables: ReturnType<typeof useListTablesQuery>;
  ordersTable: unknown;
  tableMetadata: ReturnType<typeof useGetTableQueryMetadataQuery>;
};

function getError({
  databases,
  sampleDatabase,
  tables,
  ordersTable,
  tableMetadata,
}: GetErrorOpts): string | undefined {
  if (databases.isError || tables.isError || tableMetadata.isError) {
    return t`Failed to load Sample Database metadata.`;
  }
  if (databases.isSuccess && !sampleDatabase) {
    return t`No Sample Database on this instance.`;
  }
  if (tables.isSuccess && !ordersTable) {
    return t`Sample Database has no ORDERS table.`;
  }
  return undefined;
}
