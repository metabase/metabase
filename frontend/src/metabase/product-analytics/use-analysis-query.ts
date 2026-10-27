import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useGetNativeDatasetQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import type * as Lib from "metabase-lib";
import type {
  ConcreteTableId,
  Dataset,
  DatasetQuery,
  NativeDatasetQuery,
} from "metabase-types/api";

import { type BaseQueryInput, buildBaseQuery } from "./base-query";
import {
  type BaseColumns,
  type BasePeopleSegments,
  buildSql,
} from "./build-sql";
import type { ProjectedColumn } from "./columns";
import { nativeCompileRequest } from "./compile-base";
import { COLUMN_ROLE_FOR_GRAIN } from "./filters";
import { buildPeopleSegmentsQuery } from "./segments/people-segments";
import type { AnalysisSpec } from "./spec/types";

export type AnalysisQueryArgs = {
  /** Undefined while the settings are incomplete. Nothing is compiled or run. */
  spec: AnalysisSpec | undefined;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged; see the comment in `useCompiledBase`. */
  base: BaseQueryInput;
};

type AnalysisQueryResult = {
  sql: string | null;
  compiledBase: CompiledBase | undefined;
  dataset: Dataset | undefined;
  datasetQuery: DatasetQuery | undefined;
  warnings: string[];
  isLoading: boolean;
  error: string | undefined;
};

/**
 * The base query compiled to SQL, with what the planners need to read it.
 * Shared by the analysis and the queries built from it, such as drills.
 */
export type CompiledBase = {
  sql: string;
  databaseId: number;
  columns: BaseColumns;
};

type CompiledBaseArgs = {
  isReady: boolean;
  tableId: ConcreteTableId | undefined;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
};

type CompiledBaseResult = {
  compiled: CompiledBase | undefined;
  isLoading: boolean;
  error: string | undefined;
};

/**
 * Compiles the base query to SQL with `/api/dataset/native`. Nothing is
 * compiled until `isReady`.
 */
const useCompiledBase = ({
  isReady,
  tableId,
  base,
}: CompiledBaseArgs): CompiledBaseResult => {
  const tableMetadata = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  // currentData, not data: RTK keeps `data` from the previous args, which
  // would pair a stale table, base SQL or result with the new request.
  const table = tableMetadata.currentData;
  const databaseId = table?.db_id;
  const metadataProvider = useMetadataProvider(databaseId ?? null);

  // Lib.toJsQuery mints a new lib/uuid on every clause. Rebuilding the request
  // each render gives RTK a new cache key, so getNativeDataset stays pending
  // forever and /api/dataset never runs.
  const request = useMemo(() => {
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
        flags: built.flags,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isReady, databaseId, tableId, table, metadataProvider, base]);

  const native = useGetNativeDatasetQuery(request?.request ?? skipToken);
  const sql = native.currentData?.query;

  const people = useCompiledPeopleSegments({
    isReady: request?.request !== undefined,
    metadataProvider,
    base,
  });

  const compiled = useMemo((): CompiledBase | undefined => {
    const extraColumns: ProjectedColumn[] | undefined = request?.extraColumns;
    const compiledDatabaseId = request?.databaseId;
    const flags = request?.flags;
    const hasPeopleSegments = base.peopleSegments.length > 0;
    return sql !== undefined &&
      extraColumns !== undefined &&
      compiledDatabaseId !== undefined &&
      flags !== undefined &&
      (!hasPeopleSegments || people.compiled !== undefined)
      ? {
          sql,
          databaseId: compiledDatabaseId,
          columns: {
            columns: base.columns,
            flags,
            extraColumns,
            cohorts: base.filters.cohorts.flatMap(({ grain, ids }) => {
              const column = base.columns[COLUMN_ROLE_FOR_GRAIN[grain]];
              return column !== null ? [{ column, ids }] : [];
            }),
            peopleSegments: people.compiled,
          },
        }
      : undefined;
  }, [sql, request, base, people.compiled]);

  const queryError = native.error
    ? getErrorMessage(native.error)
    : tableMetadata.error
      ? getErrorMessage(tableMetadata.error)
      : undefined;

  return {
    compiled,
    isLoading:
      tableId !== undefined &&
      (tableMetadata.isFetching || native.isFetching || people.isLoading),
    error: request?.error ?? queryError ?? people.error,
  };
};

type CompiledPeopleSegmentsArgs = {
  /** The base query compiles; nothing is compiled before it does. */
  isReady: boolean;
  metadataProvider: Lib.MetadataProvider;
  /** Must keep its identity while unchanged. */
  base: BaseQueryInput;
};

type CompiledPeopleSegmentsResult = {
  /** Undefined while compiling, and when no people segment is in use. */
  compiled: BasePeopleSegments | undefined;
  isLoading: boolean;
  error: string | undefined;
};

/** Compiles who's in each people segment the analysis uses, from the users table. */
const useCompiledPeopleSegments = ({
  isReady,
  metadataProvider,
  base,
}: CompiledPeopleSegmentsArgs): CompiledPeopleSegmentsResult => {
  const { usersTable, peopleSegments, requiredPeopleSegments } = base;
  // Memoized for the same reason as the base query's request.
  const request = useMemo(() => {
    if (!isReady || peopleSegments.length === 0) {
      return undefined;
    }
    if (usersTable === undefined) {
      return {
        error: t`Link a Customers or Users table to the person column to use people segments.`,
      };
    }
    try {
      const query = buildPeopleSegmentsQuery(
        metadataProvider,
        usersTable,
        peopleSegments,
      );
      return {
        request: nativeCompileRequest(query),
        primaryKey: usersTable.primaryKey,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [isReady, metadataProvider, usersTable, peopleSegments]);

  const native = useGetNativeDatasetQuery(request?.request ?? skipToken);
  const sql = native.currentData?.query;
  const primaryKey = request?.primaryKey;

  const compiled = useMemo(
    (): BasePeopleSegments | undefined =>
      sql !== undefined && primaryKey !== undefined
        ? {
            sql,
            primaryKey,
            flags: peopleSegments.map(({ flag }) => flag),
            required: [...requiredPeopleSegments],
          }
        : undefined,
    [sql, primaryKey, peopleSegments, requiredPeopleSegments],
  );

  return {
    compiled,
    isLoading: native.isFetching,
    error:
      request?.error ??
      (native.error ? getErrorMessage(native.error) : undefined),
  };
};

type NativeQueryWithConstraints = NativeDatasetQuery & {
  constraints: { "max-results": number; "max-results-bare-rows": number };
};

/**
 * A native query for `/api/dataset`. `maxRows` raises the default row limit
 * for results that are known to be bounded.
 */
const toNativeDatasetQuery = (
  sql: string,
  databaseId: number,
  maxRows?: number,
): DatasetQuery => {
  const query: NativeDatasetQuery = {
    type: "native",
    database: databaseId,
    native: { query: sql },
  };
  if (maxRows === undefined) {
    return query;
  }
  const constrained: NativeQueryWithConstraints = {
    ...query,
    constraints: { "max-results": maxRows, "max-results-bare-rows": maxRows },
  };
  return constrained;
};

/** The error a query result carries, from the request or the query itself. */
export const getDatasetError = (result: {
  error?: unknown;
  currentData?: Dataset;
}): string | undefined =>
  result.error
    ? getErrorMessage(result.error)
    : result.currentData?.error
      ? getErrorMessage(result.currentData.error)
      : undefined;

export const useAnalysisQuery = ({
  spec,
  tableId,
  base,
}: AnalysisQueryArgs): AnalysisQueryResult => {
  const { compiled, isLoading, error } = useCompiledBase({
    isReady: spec !== undefined,
    tableId,
    base,
  });

  const built =
    spec && compiled
      ? buildSql(spec, compiled.sql, compiled.columns)
      : undefined;

  const datasetQuery: DatasetQuery | undefined =
    built && compiled
      ? toNativeDatasetQuery(built.sql, compiled.databaseId)
      : undefined;

  const adhoc = useGetAdhocQueryQuery(datasetQuery ?? skipToken);

  return {
    sql: built?.sql ?? compiled?.sql ?? null,
    compiledBase: compiled,
    dataset: adhoc.currentData,
    datasetQuery,
    warnings: built?.warnings ?? [],
    isLoading: isLoading || adhoc.isFetching,
    error: error ?? getDatasetError(adhoc),
  };
};
