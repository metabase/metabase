import { useMemo } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetNativeDatasetQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import type { DatePickerValue } from "metabase/querying/common/types";
import type {
  ConcreteTableId,
  Dataset,
  DatasetQuery,
} from "metabase-types/api";

import { buildBaseQuery } from "./base-query";
import { buildSql } from "./build-sql";
import { nativeCompileRequest } from "./compile-base";
import type { AnalysisSpec } from "./spec/types";

export type AnalysisQueryArgs = {
  spec: AnalysisSpec;
  tableId: ConcreteTableId | undefined;
  dateFilter: DatePickerValue | undefined;
};

export type AnalysisQueryResult = {
  sql: string | null;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
  warnings: string[];
  isLoading: boolean;
  error: string | undefined;
};

export const useAnalysisQuery = ({
  spec,
  tableId,
  dateFilter,
}: AnalysisQueryArgs): AnalysisQueryResult => {
  const tableMetadata = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  const databaseId = tableMetadata.data?.db_id;
  const metadataProvider = useMetadataProvider(databaseId ?? null);

  // Lib.toJsQuery mints a new lib/uuid on every clause. Rebuilding the request
  // each render gives RTK a new cache key, so getNativeDataset stays pending
  // forever and /api/dataset never runs.
  const compiledBase = useMemo(() => {
    if (
      databaseId === undefined ||
      tableId === undefined ||
      !tableMetadata.data
    ) {
      return undefined;
    }
    try {
      const built = buildBaseQuery(metadataProvider, tableId, dateFilter);
      return {
        request: nativeCompileRequest(built.query),
        databaseId: built.databaseId,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [databaseId, tableId, tableMetadata.data, metadataProvider, dateFilter]);

  const native = useGetNativeDatasetQuery(compiledBase?.request ?? skipToken);
  const compiledDatabaseId = compiledBase?.databaseId;
  const baseError = compiledBase?.error;

  const built =
    native.data?.query && compiledDatabaseId !== undefined
      ? buildSql(spec, native.data.query)
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
      : adhoc.data?.error
        ? getErrorMessage(adhoc.data.error)
        : tableMetadata.error
          ? getErrorMessage(tableMetadata.error)
          : undefined;

  const error = baseError ?? queryError;

  const isLoading =
    tableId !== undefined &&
    (tableMetadata.isLoading || native.isFetching || adhoc.isFetching);

  return {
    sql: built?.sql ?? native.data?.query ?? null,
    dataset: adhoc.data,
    datasetQuery,
    warnings: built?.warnings ?? [],
    isLoading,
    error,
  };
};
