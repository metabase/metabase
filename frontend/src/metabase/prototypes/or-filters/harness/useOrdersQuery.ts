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
/** Implicitly joinable through Orders' FKs; needed for Product → Category and User → State breakouts. */
const RELATED_TABLE_NAMES = ["PRODUCTS", "PEOPLE"];

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
  const [productsTable, peopleTable] = RELATED_TABLE_NAMES.map((name) =>
    tables.data?.find((table) => table.name === name),
  );
  const productsMetadata = useGetTableQueryMetadataQuery(
    productsTable ? { id: productsTable.id } : skipToken,
  );
  const peopleMetadata = useGetTableQueryMetadataQuery(
    peopleTable ? { id: peopleTable.id } : skipToken,
  );
  const isRelatedMetadataLoaded =
    (!productsTable || productsMetadata.isSuccess) &&
    (!peopleTable || peopleMetadata.isSuccess);

  const metadataProvider = useMetadataProviderUnfiltered(
    sampleDatabase?.id ?? null,
  );

  const query = useMemo(() => {
    if (!ordersTable || !tableMetadata.isSuccess || !isRelatedMetadataLoaded) {
      return undefined;
    }
    const table = Lib.tableOrCardMetadata(metadataProvider, ordersTable.id);
    return table
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, table)
      : undefined;
  }, [
    metadataProvider,
    ordersTable,
    tableMetadata.isSuccess,
    isRelatedMetadataLoaded,
  ]);

  const isLoading =
    databases.isLoading ||
    tables.isLoading ||
    tableMetadata.isLoading ||
    productsMetadata.isLoading ||
    peopleMetadata.isLoading;

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
