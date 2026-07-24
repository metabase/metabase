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
 * Building the slice via `preloadedState` keeps it fully synchronous and per-store:
 * no cross-test leakage, and reads resolve on the first render.
 *
 * Note: a seeded entry is `fulfilled`, so `useXQuery` hooks won't refetch on mount.
 * A test that needs to assert a fetch happened should drive the query
 * explicitly, or not seed the cache, instead.
 */
export function seedApiQueryCache(
  currentApiState: ApiState | undefined,
  entries: QueryCacheSeed[],
): ApiState {
  // Skip entries that are already seeded. Upserting an existing entry leaves
  // it stuck `pending` (the second upsert keeps the first requestId, so the
  // fulfilled write is rejected), and under the default "delayed"
  // invalidation behaviour one forever-pending query silently defers every
  // tag invalidation in the store.
  const existingQueries = Object.values(currentApiState?.queries ?? {});
  const newEntries = entries.filter(
    ({ endpointName, arg }) =>
      !existingQueries.some(
        (query) =>
          query?.endpointName === endpointName &&
          JSON.stringify(query?.originalArgs) === JSON.stringify(arg),
      ),
  );

  if (newEntries.length === 0 && currentApiState) {
    return currentApiState;
  }

  // endpointName/value are validated at runtime by RTK against the injected
  // endpoint registry. The cast keeps this helper endpoint-agnostic.
  const upsertEntries = newEntries.map(({ endpointName, arg, value }) => ({
    endpointName,
    arg,
    value,
  })) as Parameters<typeof Api.util.upsertQueryEntries>[0];

  return Api.reducer(
    currentApiState,
    Api.util.upsertQueryEntries(upsertEntries),
  );
}
