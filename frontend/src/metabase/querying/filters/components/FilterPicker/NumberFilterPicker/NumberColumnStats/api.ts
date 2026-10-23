import { Api } from "metabase/api";
import type { Dataset, DatasetQuery } from "metabase-types/api";

interface StatsQueryArgs {
  query: DatasetQuery;
  /** Run the query on the samples of the slow prototype tables. */
  isSample: boolean;
}

// Prototype: the shared ad-hoc query endpoint drops a result as soon as nothing
// uses it, so every time the popover opens, it runs the stats queries again.
// The prototype data does not change, so this endpoint keeps the results.
const statsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getPrototypeStatsQuery: builder.query<Dataset, StatsQueryArgs>({
      query: ({ query, isSample }) => ({
        method: "POST",
        url: "/api/dataset",
        body: isSample
          ? { ...query, middleware: { "prototype-sample?": true } }
          : query,
      }),
      keepUnusedDataFor: 10 * 60,
      // Each build of a stats query gives its clauses new `lib/uuid`s, so the
      // cache key leaves them out.
      serializeQueryArgs: ({ endpointName, queryArgs }) =>
        `${endpointName}(${JSON.stringify(queryArgs, (key, value) =>
          key === "lib/uuid" ? undefined : value,
        )})`,
    }),
  }),
});

export const { useGetPrototypeStatsQueryQuery } = statsApi;
