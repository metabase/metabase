import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetNativeDatasetQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import type {
  ConcreteTableId,
  Dataset,
  DatasetQuery,
} from "metabase-types/api";

import { type BaseQueryInput, buildBaseQuery } from "./base-query";
import { type BaseColumns, buildSql } from "./build-sql";
import { nativeCompileRequest } from "./compile-base";
import { COLUMN_ROLE_FOR_GRAIN } from "./filters";
import type { AnalysisSpec } from "./spec/types";

export type AnalysisQueryArgs = {
  /** Undefined while the settings are incomplete. Nothing is compiled or run. */
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged; see the comment on `compiledBase`. */
  base: BaseQueryInput;
};

/** The compiled event stream an analysis reads, for building related queries. */
export type CompiledBase = {
  sql: string;
  databaseId: number;
  columns: BaseColumns;
};

export type AnalysisQueryResult = {
  sql: string | null;
  compiledBase: CompiledBase | undefined;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
  warnings: string[];
  isLoading: boolean;
  error: string | undefined;
};

export const useAnalysisQuery = ({
  spec,
  tableId,
  base,
}: AnalysisQueryArgs): AnalysisQueryResult => {
  const tableMetadata = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  // currentData, not data: RTK keeps `data` from the previous args, which
  // would pair a stale table, base SQL or result with the new request.
  const table = tableMetadata.currentData;
  const databaseId = table?.db_id;
  const metadataProvider = useMetadataProvider(databaseId ?? null);
  // A boolean, not `spec`: the spec is rebuilt every render, see below.
  const isReady = spec !== undefined;

  // Lib.toJsQuery mints a new lib/uuid on every clause. Rebuilding the request
  // each render gives RTK a new cache key, so getNativeDataset stays pending
  // forever and /api/dataset never runs.
  const compiledBase = useMemo(() => {
    if (
      !isReady ||
      databaseId === undefined ||
      tableId === undefined ||
      table === undefined
    ) {
      return undefined;
    }
    try {
      const built = buildBaseQuery(metadataProvider, tableId, base);
      return {
        request: nativeCompileRequest(built.query),
        databaseId: built.databaseId,
        extraColumns: built.extraColumns,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isReady, databaseId, tableId, table, metadataProvider, base]);

  const native = useGetNativeDatasetQuery(compiledBase?.request ?? skipToken);
  const compiledDatabaseId = compiledBase?.databaseId;
  const baseError = compiledBase?.error;

  const baseSql = native.currentData?.query;

  const compiled = useMemo<CompiledBase | undefined>(
    () =>
      baseSql !== undefined &&
      compiledBase?.extraColumns !== undefined &&
      compiledDatabaseId !== undefined
        ? {
            sql: baseSql,
            databaseId: compiledDatabaseId,
            columns: {
              columns: base.columns,
              flags: base.events.map(({ flag }) => flag),
              extraColumns: compiledBase.extraColumns,
              cohorts: base.filters.cohorts.flatMap(({ grain, ids }) => {
                const column = base.columns[COLUMN_ROLE_FOR_GRAIN[grain]];
                return column !== null ? [{ column, ids }] : [];
              }),
            },
          }
        : undefined,
    [baseSql, compiledBase, compiledDatabaseId, base],
  );

  const built =
    spec && compiled
      ? buildSql(spec, compiled.sql, compiled.columns)
      : undefined;

  const datasetQuery: DatasetQuery | undefined =
    built && compiledDatabaseId !== undefined
      ? {
          type: "native",
          database: compiledDatabaseId,
          native: { query: built.sql },
        }
      : undefined;

  const adhoc = useGetAdhocQueryQuery(datasetQuery ?? skipToken);

  const queryError = native.error
    ? getErrorMessage(native.error)
    : adhoc.error
      ? getErrorMessage(adhoc.error)
      : adhoc.currentData?.error
        ? getErrorMessage(adhoc.currentData.error)
        : tableMetadata.error
          ? getErrorMessage(tableMetadata.error)
          : undefined;

  const error = baseError ?? queryError;

  const isLoading =
    tableId !== undefined &&
    (tableMetadata.isFetching || native.isFetching || adhoc.isFetching);

  return {
    sql: built?.sql ?? baseSql ?? null,
    compiledBase: compiled,
    dataset: adhoc.currentData,
    datasetQuery,
    warnings: built?.warnings ?? [],
    isLoading,
    error,
  };
};
