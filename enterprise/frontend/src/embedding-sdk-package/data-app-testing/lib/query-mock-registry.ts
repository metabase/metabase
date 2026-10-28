import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import { stableStringifyQuery } from "embedding-sdk-package/hooks/public/use-metabase-query/stable-query-key";
import {
  type MockSdkHandlers,
  getMockSdkHandlers,
} from "embedding-sdk-package/testing/lib/mock-sdk-handlers";
import type { DatasetQuery, NativeDatasetQuery } from "metabase-types/api";

type QueryRequest = {
  query: unknown;
  dynamicQuery: unknown;
};

export type QueryMockEntry = {
  query: unknown;
  dynamicQueryKey: string;
  respond: (request: QueryRequest) => Promise<QueryDatasetResult>;
};

const entriesByHandlers = new WeakMap<MockSdkHandlers, QueryMockEntry[]>();
const requestsByDatasetQuery = new WeakMap<DatasetQuery, QueryRequest>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmptyClause = (value: unknown) =>
  value === undefined || (Array.isArray(value) && value.length === 0);

export const getDynamicQueryKey = (dynamicQuery: unknown): string => {
  if (!isRecord(dynamicQuery)) {
    return "";
  }

  const clauses = Object.entries(dynamicQuery).filter(
    ([key, value]) => key !== "enabled" && !isEmptyClause(value),
  );

  return clauses.length > 0
    ? stableStringifyQuery(Object.fromEntries(clauses))
    : "";
};

const getSourceKey = (query: unknown): string | undefined => {
  const source = isRecord(query) ? query.source : undefined;

  if (!isRecord(source)) {
    return undefined;
  }

  return typeof source.entityId === "string"
    ? source.entityId
    : `${String(source.type)}:${String(source.id)}`;
};

const getQueryLabel = (query: unknown): string => {
  const source = isRecord(query) ? query.source : undefined;
  const name = isRecord(source) ? source.name : undefined;

  return typeof name === "string" ? name : (getSourceKey(query) ?? "query");
};

const isSameQuery = (registered: unknown, requested: unknown) =>
  registered === requested ||
  (getSourceKey(registered) !== undefined &&
    getSourceKey(registered) === getSourceKey(requested));

const createNoMockError = ({ query, dynamicQuery }: QueryRequest) => {
  const dynamicQueryKey = getDynamicQueryKey(dynamicQuery);
  const dynamicPart = dynamicQueryKey
    ? ` with dynamic part ${dynamicQueryKey}`
    : "";

  return new Error(
    `No mock for query "${getQueryLabel(query)}"${dynamicPart}. Call mockQuery for it before rendering.`,
  );
};

const answerQuery = (
  entries: readonly QueryMockEntry[],
  request: QueryRequest,
): Promise<QueryDatasetResult> => {
  const dynamicQueryKey = getDynamicQueryKey(request.dynamicQuery);
  const entry = entries.find(
    (candidate) =>
      isSameQuery(candidate.query, request.query) &&
      candidate.dynamicQueryKey === dynamicQueryKey,
  );

  return entry
    ? entry.respond(request)
    : Promise.reject(createNoMockError(request));
};

const getQueryMockEntries = (): QueryMockEntry[] => {
  const handlers = getMockSdkHandlers();
  const existingEntries = entriesByHandlers.get(handlers);

  if (existingEntries) {
    return existingEntries;
  }

  const entries: QueryMockEntry[] = [];
  entriesByHandlers.set(handlers, entries);

  handlers.resolveDatasetQuery = () => async (query, dynamicQuery) => {
    const datasetQuery: NativeDatasetQuery = {
      type: "native",
      native: { query: "" },
      database: null,
    };
    requestsByDatasetQuery.set(datasetQuery, { query, dynamicQuery });

    return datasetQuery;
  };

  handlers.queryDataset =
    () =>
    async ({ datasetQuery }) => {
      const request = requestsByDatasetQuery.get(datasetQuery);

      if (!request) {
        throw new Error("The dataset query was not built by a mocked query.");
      }

      return answerQuery(entries, request);
    };

  return entries;
};

export const registerQueryMock = (entry: QueryMockEntry) => {
  const entries = getQueryMockEntries();
  const replacedIndex = entries.findIndex(
    (candidate) =>
      candidate.query === entry.query &&
      candidate.dynamicQueryKey === entry.dynamicQueryKey,
  );

  if (replacedIndex >= 0) {
    entries.splice(replacedIndex, 1);
  }

  entries.unshift(entry);
};
