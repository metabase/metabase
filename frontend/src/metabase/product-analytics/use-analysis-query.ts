import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetNativeDatasetQuery,
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import { isConcreteTableId } from "metabase-types/api";
import type { Dataset, NativeDatasetQuery } from "metabase-types/api";

import { buildBaseQuery } from "./base-query";
import { buildSql } from "./build-sql";
import { nativeCompileRequest } from "./compile-base";
import {
  PROTOTYPE_DATABASE_NAME,
  PROTOTYPE_RANGE_DAYS,
  PROTOTYPE_TABLE_NAME,
} from "./config";
import type { AnalysisSpec } from "./spec/types";

export type AnalysisQueryResult = {
  sql: string | null;
  dataset: Dataset | undefined;
  warnings: string[];
  isLoading: boolean;
  error: string | undefined;
};

export const useAnalysisQuery = (spec: AnalysisSpec): AnalysisQueryResult => {
  const databases = useListDatabasesQuery();
  const database = databases.data?.data.find(
    (item) => item.name === PROTOTYPE_DATABASE_NAME,
  );

  const tables = useListTablesQuery({ term: PROTOTYPE_TABLE_NAME });
  const table = tables.data?.find(
    (item) =>
      item.name === PROTOTYPE_TABLE_NAME &&
      (database === undefined || item.db_id === database.id),
  );
  const tableId = table && isConcreteTableId(table.id) ? table.id : undefined;

  const tableMetadata = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );

  const metadataProvider = useMetadataProvider(database?.id ?? null);

  // Lib.toJsQuery mints a new lib/uuid on every clause. Rebuilding the request
  // each render gives RTK a new cache key, so getNativeDataset stays pending
  // forever and /api/dataset never runs.
  const compiledBase = useMemo(() => {
    if (
      database?.id === undefined ||
      tableId === undefined ||
      !tableMetadata.data
    ) {
      return undefined;
    }
    try {
      const built = buildBaseQuery(
        metadataProvider,
        tableId,
        PROTOTYPE_RANGE_DAYS,
      );
      return {
        request: nativeCompileRequest(built.query),
        databaseId: built.databaseId,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [database?.id, tableId, tableMetadata.data, metadataProvider]);

  const native = useGetNativeDatasetQuery(compiledBase?.request ?? skipToken);
  const databaseId = compiledBase?.databaseId;
  const baseError = compiledBase?.error;

  const built =
    native.data?.query && databaseId !== undefined
      ? buildSql(spec, native.data.query)
      : undefined;

  const runRequest: NativeDatasetQuery | typeof skipToken =
    built && databaseId !== undefined
      ? {
          type: "native",
          database: databaseId,
          native: { query: built.sql },
        }
      : skipToken;

  const adhoc = useGetAdhocQueryQuery(runRequest);

  const missing =
    databases.isSuccess && !database
      ? `No database named “${PROTOTYPE_DATABASE_NAME}”. Add the ClickHouse connection first.`
      : databases.isSuccess &&
          database &&
          tables.isSuccess &&
          tableId === undefined
        ? `No table named ${PROTOTYPE_TABLE_NAME} on ${PROTOTYPE_DATABASE_NAME}. Run 02_pa_events_resolved.sql and sync.`
        : undefined;

  const queryError = native.error
    ? getErrorMessage(native.error)
    : adhoc.error
      ? getErrorMessage(adhoc.error)
      : adhoc.data?.error
        ? getErrorMessage(adhoc.data.error)
        : undefined;

  const error = missing ?? baseError ?? queryError;

  const isLoading =
    databases.isLoading ||
    tables.isLoading ||
    tableMetadata.isLoading ||
    native.isFetching ||
    adhoc.isFetching;

  return {
    sql: built?.sql ?? native.data?.query ?? null,
    dataset: adhoc.data,
    warnings: built?.warnings ?? [],
    isLoading,
    error,
  };
};
