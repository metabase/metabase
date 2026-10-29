import type { RowValue } from "embedding-sdk-package/hooks/public/data-schema";
import type {
  DefinedQuery,
  MetabaseDynamicQuery,
  MetabaseQueryRow,
  QueryEntity,
  RequireAggregationsForBreakouts,
  RequireDynamicOrderByNames,
} from "embedding-sdk-package/hooks/public/use-metabase-query/types";
import type { MetabaseQueryMock } from "embedding-sdk-package/testing/lib/private/queries";
import type { SchemaColumn } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { DatasetColumn, RowValues } from "metabase-types/api";

import { getQueryResultColumns } from "../private/query-result-columns";

export type DataAppQueryMockCall<TDynamic> = {
  dynamicQuery: TDynamic;
};

export type DataAppQueryMock<TDynamic> = MetabaseQueryMock & {
  calls: () => readonly DataAppQueryMockCall<TDynamic>[];
  lastCall: () => DataAppQueryMockCall<TDynamic> | undefined;
};

export type DataAppQueryMockError = {
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

const DEFAULT_DATE_VALUE = "1970-01-01T00:00:00Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDefaultValue(column: SchemaColumn): RowValue {
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
}

function toRowValue(value: unknown): RowValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (typeof value === "object" && value !== null)
  ) {
    return value;
  }

  return null;
}

function toRowValues(
  row: unknown,
  columns: readonly SchemaColumn[],
): RowValues {
  return columns.map((column) =>
    isRecord(row) && Object.hasOwn(row, column.name)
      ? toRowValue(row[column.name])
      : getDefaultValue(column),
  );
}

function toDatasetColumn(column: SchemaColumn): DatasetColumn {
  return {
    name: column.name,
    display_name: column.displayName ?? column.name,
    source: "fields",
    ...(column.baseType !== undefined && { base_type: column.baseType }),
    ...(column.effectiveType !== undefined && {
      effective_type: column.effectiveType,
    }),
  };
}

function createQueryMock<TDynamic>(
  query: DefinedQuery,
  dynamicQuery: TDynamic,
  respond: (columns: SchemaColumn[]) => Promise<{
    columns: DatasetColumn[];
    rows: RowValues[];
  }>,
): DataAppQueryMock<TDynamic> {
  const calls: DataAppQueryMockCall<TDynamic>[] = [];

  return {
    query,
    dynamicQuery,
    respond: async () => {
      calls.push({ dynamicQuery });
      const { columns, rows } = await respond(
        getQueryResultColumns(query, dynamicQuery),
      );

      return {
        columns,
        rows,
        rowCount: rows.length,
        runningTime: 0,
      };
    },
    calls: () => calls,
    lastCall: () => calls.at(-1),
  };
}

export function mockDataAppQuery<TQuery extends DefinedQuery>(
  query: TQuery,
  rows: readonly Partial<MetabaseQueryRow<TQuery>>[],
): DataAppQueryMock<undefined>;
export function mockDataAppQuery<
  TQuery extends DefinedQuery,
  const TDynamic = undefined,
>(
  query: TQuery,
  dynamicQuery: DynamicQueryFor<TQuery, TDynamic> | undefined,
  rows: readonly Partial<MetabaseQueryRow<TQuery, TDynamic>>[],
): DataAppQueryMock<TDynamic>;
export function mockDataAppQuery(
  query: DefinedQuery,
  ...args: [readonly unknown[]] | [unknown, readonly unknown[]]
): DataAppQueryMock<unknown> {
  const [dynamicQuery, rows] = args.length === 1 ? [undefined, args[0]] : args;

  return createQueryMock(query, dynamicQuery, async (columns) => ({
    columns: columns.map(toDatasetColumn),
    rows: rows.map((row) => toRowValues(row, columns)),
  }));
}

export function mockDataAppQueryError<TQuery extends DefinedQuery>(
  query: TQuery,
  error?: DataAppQueryMockError,
): DataAppQueryMock<undefined>;
export function mockDataAppQueryError<
  TQuery extends DefinedQuery,
  const TDynamic = undefined,
>(
  query: TQuery,
  dynamicQuery: DynamicQueryFor<TQuery, TDynamic> | undefined,
  error: DataAppQueryMockError,
): DataAppQueryMock<TDynamic>;
export function mockDataAppQueryError(
  query: DefinedQuery,
  ...args: [DataAppQueryMockError?] | [unknown, DataAppQueryMockError]
): DataAppQueryMock<unknown> {
  const [dynamicQuery, error = {}] =
    args.length === 2 ? args : [undefined, args[0]];

  return createQueryMock(query, dynamicQuery, () =>
    Promise.reject({
      status: error.status ?? 500,
      data: { message: error.message ?? "Query failed" },
    }),
  );
}
