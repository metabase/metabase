import { uniq } from "es-toolkit";

import type { RowValue } from "embedding-sdk-package/hooks/public/data-schema";
import type {
  DynamicQueryArgument,
  MetabaseQueryOptions,
  MetabaseQueryRow,
} from "embedding-sdk-package/hooks/public/use-metabase-query/types";
import {
  type MockCalls,
  createMockCalls,
} from "embedding-sdk-package/testing/lib/private/mock-calls";
import type { MetabaseQueryMock } from "embedding-sdk-package/testing/lib/private/queries";
import type {
  DynamicQueryInput,
  QueryInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { getQueryResultColumnNames } from "embedding-sdk-shared/lib/create-metabase-query/result-columns";
import type { DatasetColumn, RowValues } from "metabase-types/api";

export type DataAppQueryMockCall<TDynamic> = {
  dynamicQuery: TDynamic;
};

export type DataAppQueryMock<TDynamic> = MetabaseQueryMock &
  MockCalls<DataAppQueryMockCall<TDynamic>>;

export type DataAppMockError = {
  status?: number;
  message?: string;
};

type MockRow = Partial<Record<string, RowValue>>;

function getResultColumns(
  query: QueryInput,
  dynamicQuery: DynamicQueryInput | undefined,
  rows: readonly MockRow[],
): DatasetColumn[] {
  const queryNames = getQueryResultColumnNames(query, dynamicQuery);
  const names =
    queryNames.length > 0 ? queryNames : uniq(rows.flatMap(Object.keys));

  return names.map((name) => ({ name, display_name: name, source: "fields" }));
}

function createQueryMock<TDynamic>(
  query: QueryInput,
  dynamicQuery: TDynamic & (DynamicQueryInput | undefined),
  respond: () => Promise<{ columns: DatasetColumn[]; rows: RowValues[] }>,
): DataAppQueryMock<TDynamic> {
  const calls = createMockCalls<DataAppQueryMockCall<TDynamic>>();

  return {
    query,
    dynamicQuery,
    respond: async () => {
      calls.record({ dynamicQuery });
      const { columns, rows } = await respond();

      return { columns, rows, rowCount: rows.length, runningTime: 0 };
    },
    calls: calls.calls,
    lastCall: calls.lastCall,
  };
}

export function mockDataAppQuery<TQuery extends MetabaseQueryOptions>(
  query: TQuery,
  rows: readonly Partial<MetabaseQueryRow<TQuery>>[],
): DataAppQueryMock<undefined>;
export function mockDataAppQuery<
  TQuery extends MetabaseQueryOptions,
  const TDynamic = undefined,
>(
  query: TQuery,
  dynamicQuery: DynamicQueryArgument<undefined, TQuery, TDynamic> | undefined,
  rows: readonly Partial<MetabaseQueryRow<TQuery, TDynamic>>[],
): DataAppQueryMock<TDynamic>;
export function mockDataAppQuery(
  query: MetabaseQueryOptions,
  ...args:
    | [readonly MockRow[]]
    | [DynamicQueryInput | undefined, readonly MockRow[]]
): DataAppQueryMock<DynamicQueryInput | undefined> {
  const [dynamicQuery, rows] = args.length === 1 ? [undefined, args[0]] : args;
  const columns = getResultColumns(query, dynamicQuery, rows);

  return createQueryMock(query, dynamicQuery, async () => ({
    columns,
    rows: rows.map((row) => columns.map(({ name }) => row[name] ?? null)),
  }));
}

export function mockDataAppQueryError<TQuery extends MetabaseQueryOptions>(
  query: TQuery,
  error?: DataAppMockError,
): DataAppQueryMock<undefined>;
export function mockDataAppQueryError<
  TQuery extends MetabaseQueryOptions,
  const TDynamic = undefined,
>(
  query: TQuery,
  dynamicQuery: DynamicQueryArgument<undefined, TQuery, TDynamic> | undefined,
  error: DataAppMockError,
): DataAppQueryMock<TDynamic>;
export function mockDataAppQueryError(
  query: MetabaseQueryOptions,
  ...args:
    | [DataAppMockError?]
    | [DynamicQueryInput | undefined, DataAppMockError]
): DataAppQueryMock<DynamicQueryInput | undefined> {
  const [dynamicQuery, error = {}] =
    args.length === 2 ? args : [undefined, args[0]];

  return createQueryMock(query, dynamicQuery, () =>
    Promise.reject({
      status: error.status ?? 500,
      data: { message: error.message ?? "Query failed" },
    }),
  );
}
