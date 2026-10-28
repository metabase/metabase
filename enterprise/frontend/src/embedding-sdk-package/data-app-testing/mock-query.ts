import type { RowValue } from "embedding-sdk-package/hooks/public/data-schema";
import type {
  DefinedQuery,
  MetabaseDynamicQuery,
  QueryEntity,
  QueryRow,
  RequireAggregationsForBreakouts,
  RequireDynamicOrderByNames,
} from "embedding-sdk-package/hooks/public/use-metabase-query/types";
import type { SchemaColumn } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { DatasetColumn, RowValues } from "metabase-types/api";

import {
  getDynamicQueryKey,
  registerQueryMock,
} from "./lib/query-mock-registry";
import { getQueryResultColumns } from "./lib/query-result-columns";

export type QueryMockCall<TDynamic> = {
  dynamicQuery: TDynamic;
};

export type QueryMock<TDynamic> = {
  calls: () => readonly QueryMockCall<TDynamic>[];
  lastCall: () => QueryMockCall<TDynamic> | undefined;
};

export type QueryMockError = {
  status?: number;
  message?: string;
};

type DynamicQueryFor<TQuery, TDynamic> = TDynamic &
  (TDynamic extends MetabaseDynamicQuery<QueryEntity<undefined, TQuery>, TQuery>
    ? RequireAggregationsForBreakouts<TDynamic> &
        RequireDynamicOrderByNames<
          QueryEntity<undefined, TQuery>,
          TQuery,
          TDynamic
        >
    : MetabaseDynamicQuery<QueryEntity<undefined, TQuery>, TQuery>);

const DEFAULT_DATE_VALUE = "2024-01-01T00:00:00Z";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getDefaultValue = (column: SchemaColumn): RowValue => {
  switch (column.jsType) {
    case "number":
      return 1;
    case "string":
      return column.displayName ?? column.name;
    case "boolean":
      return false;
    case "Date":
      return DEFAULT_DATE_VALUE;
    default:
      return null;
  }
};

const toRowValue = (value: unknown): RowValue => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (typeof value === "object" && value !== null)
  ) {
    return value;
  }

  return null;
};

const toRowValues = (
  row: unknown,
  columns: readonly SchemaColumn[],
): RowValues =>
  columns.map((column) =>
    isRecord(row) && Object.hasOwn(row, column.name)
      ? toRowValue(row[column.name])
      : getDefaultValue(column),
  );

const toDatasetColumn = (column: SchemaColumn): DatasetColumn => ({
  name: column.name,
  display_name: column.displayName ?? column.name,
  source: "fields",
  ...(column.baseType !== undefined && { base_type: column.baseType }),
  ...(column.effectiveType !== undefined && {
    effective_type: column.effectiveType,
  }),
});

const createQueryMock = <TDynamic>(
  query: DefinedQuery,
  dynamicQuery: TDynamic,
  respond: (columns: SchemaColumn[]) => Promise<{
    columns: DatasetColumn[];
    rows: RowValues[];
  }>,
): QueryMock<TDynamic> => {
  const calls: QueryMockCall<TDynamic>[] = [];

  registerQueryMock({
    query,
    dynamicQueryKey: getDynamicQueryKey(dynamicQuery),
    respond: async (request) => {
      calls.push({ dynamicQuery });
      const { columns, rows } = await respond(
        getQueryResultColumns(request.query, request.dynamicQuery),
      );

      return {
        columns,
        rows,
        rowCount: rows.length,
        runningTime: 0,
      };
    },
  });

  return {
    calls: () => calls,
    lastCall: () => calls.at(-1),
  };
};

export function mockQuery<TQuery extends DefinedQuery>(
  query: TQuery,
  rows: readonly Partial<QueryRow<TQuery>>[],
): QueryMock<undefined>;
export function mockQuery<
  TQuery extends DefinedQuery,
  const TDynamic = undefined,
>(
  query: TQuery,
  dynamicQuery: DynamicQueryFor<TQuery, TDynamic> | undefined,
  rows: readonly Partial<QueryRow<TQuery, TDynamic>>[],
): QueryMock<TDynamic>;
export function mockQuery(
  query: DefinedQuery,
  ...args: [readonly unknown[]] | [unknown, readonly unknown[]]
): QueryMock<unknown> {
  const [dynamicQuery, rows] = args.length === 1 ? [undefined, args[0]] : args;

  return createQueryMock(query, dynamicQuery, async (columns) => ({
    columns: columns.map(toDatasetColumn),
    rows: rows.map((row) => toRowValues(row, columns)),
  }));
}

export function mockQueryError<TQuery extends DefinedQuery>(
  query: TQuery,
  error?: QueryMockError,
): QueryMock<undefined>;
export function mockQueryError<
  TQuery extends DefinedQuery,
  const TDynamic = undefined,
>(
  query: TQuery,
  dynamicQuery: DynamicQueryFor<TQuery, TDynamic> | undefined,
  error: QueryMockError,
): QueryMock<TDynamic>;
export function mockQueryError(
  query: DefinedQuery,
  ...args: [QueryMockError?] | [unknown, QueryMockError]
): QueryMock<unknown> {
  const [dynamicQuery, error = {}] =
    args.length === 2 ? args : [undefined, args[0]];

  return createQueryMock(query, dynamicQuery, () =>
    Promise.reject({
      status: error.status ?? 500,
      data: { message: error.message ?? "Query failed" },
    }),
  );
}
