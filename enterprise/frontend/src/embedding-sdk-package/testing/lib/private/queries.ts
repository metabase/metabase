import _ from "underscore";

import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import type { NativeDatasetQuery } from "metabase-types/api";

import { isRecord } from "./guards";

export type MetabaseQueryMock = {
  query: unknown;
  dynamicQuery: unknown;
  respond: () => Promise<QueryDatasetResult>;
};

type QueryHandlers = {
  resolveDatasetQuery: MetabaseEmbeddingSdkBundleExports["resolveDatasetQuery"];
  queryDataset: MetabaseEmbeddingSdkBundleExports["queryDataset"];
};

function getQueryClauses(dynamicQuery: unknown) {
  return _.omit(isRecord(dynamicQuery) ? dynamicQuery : {}, "enabled");
}

function isSameRequest(
  mock: MetabaseQueryMock,
  query: unknown,
  dynamicQuery: unknown,
) {
  return (
    _.isEqual(mock.query, query) &&
    _.isEqual(getQueryClauses(mock.dynamicQuery), getQueryClauses(dynamicQuery))
  );
}

function getQueryLabel(query: unknown) {
  const source = isRecord(query) ? query.source : undefined;

  if (!isRecord(source)) {
    return "query";
  }

  const label = source.name ?? source.entityId ?? source.id;
  return String(label);
}

function createNoQueryMockError(query: unknown, dynamicQuery: unknown) {
  const clauses = getQueryClauses(dynamicQuery);
  const dynamicPart = _.isEmpty(clauses)
    ? ""
    : ` with dynamic part ${JSON.stringify(clauses)}`;

  return new Error(
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- developer-facing error naming SDK components
    `No mock for query "${getQueryLabel(query)}"${dynamicPart}. Pass mockDataAppQuery for it in MetabaseTestProvider dataAppQueries.`,
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
