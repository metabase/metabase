import _ from "underscore";

import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import {
  type DynamicQueryInput,
  type QueryInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { NativeDatasetQuery } from "metabase-types/api";

import { TEST_PROVIDER_NAME } from "./constants";

export type MetabaseQueryMock = {
  query: QueryInput;
  dynamicQuery: DynamicQueryInput | undefined;
  respond: () => Promise<QueryDatasetResult>;
};

type QueryHandlers = {
  resolveDatasetQuery: MetabaseEmbeddingSdkBundleExports["resolveDatasetQuery"];
  queryDataset: MetabaseEmbeddingSdkBundleExports["queryDataset"];
};

function getQueryClauses(dynamicQuery: DynamicQueryInput | undefined) {
  return _.omit(dynamicQuery ?? {}, "enabled");
}

function isSameRequest(
  mock: MetabaseQueryMock,
  query: QueryInput,
  dynamicQuery: DynamicQueryInput | undefined,
) {
  return (
    _.isEqual(mock.query, query) &&
    _.isEqual(getQueryClauses(mock.dynamicQuery), getQueryClauses(dynamicQuery))
  );
}

function getQueryLabel(query: QueryInput): string {
  if (isTableInput(query) && query.entityId !== undefined) {
    return query.entityId;
  }

  const { source } = query;

  return source.type === "card"
    ? (source.name ?? source.entityId ?? String(source.id))
    : String(source.id);
}

function createNoQueryMockError(
  query: QueryInput,
  dynamicQuery: DynamicQueryInput | undefined,
) {
  const clauses = getQueryClauses(dynamicQuery);
  const dynamicPart = _.isEmpty(clauses)
    ? ""
    : ` with dynamic part ${JSON.stringify(clauses)}`;

  return new Error(
    `No mock for query "${getQueryLabel(query)}"${dynamicPart}. Pass mockDataAppQuery for it in ${TEST_PROVIDER_NAME} dataAppQueries.`,
  );
}

export function createQueryHandlers(
  queries: readonly MetabaseQueryMock[],
): QueryHandlers {
  const entries = queries.map((mock) => {
    const datasetQuery: NativeDatasetQuery = {
      type: "native",
      native: { query: "" },
      database: null,
    };

    return { mock, datasetQuery };
  });

  return {
    resolveDatasetQuery: () => async (query, dynamicQuery) => {
      const entry = entries.find(({ mock }) =>
        isSameRequest(mock, query, dynamicQuery),
      );

      if (!entry) {
        throw createNoQueryMockError(query, dynamicQuery);
      }

      return entry.datasetQuery;
    },
    queryDataset:
      () =>
      async ({ datasetQuery }) => {
        const entry = entries.find(
          (candidate) => candidate.datasetQuery === datasetQuery,
        );

        if (!entry) {
          throw new Error("Dataset query was not built by a query mock.");
        }

        return entry.mock.respond();
      },
  };
}
