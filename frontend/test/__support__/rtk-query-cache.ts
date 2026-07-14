import { Api } from "metabase/api";

type ApiState = ReturnType<typeof Api.reducer>;

export type QueryCacheSeed = {
  endpointName: string;
  arg?: unknown;
  value: unknown;
};

/**
 * Synchronously seed RTK Query cache entries into a `preloadedState` slice for
 * the shared `Api`, without a live store. Use this to give a test server data
 * that the app reads from the query cache.
 *
 * Building the slice via `preloadedState` (rather than dispatching into a built
 * store) keeps it fully synchronous and per-store: no cross-test leakage, and
 * reads resolve on the first render.
 *
 * Note: a seeded entry is `fulfilled`, so `useXQuery` hooks won't refetch on
 * mount. A test that needs to assert a fetch happened should drive the query
 * explicitly (or not seed) instead.
 */
export function seedApiQueryCache(
  currentApiState: ApiState | undefined,
  entries: QueryCacheSeed[],
): ApiState {
  // endpointName/value are validated at runtime by RTK against the injected
  // endpoint registry; the cast keeps this helper endpoint-agnostic.
  const upsertEntries = entries.map(({ endpointName, arg, value }) => ({
    endpointName,
    arg,
    value,
  })) as Parameters<typeof Api.util.upsertQueryEntries>[0];

  return Api.reducer(
    currentApiState,
    Api.util.upsertQueryEntries(upsertEntries),
  );
}
