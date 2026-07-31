// Import the `metabase/api` index, not the bare `Api` from ./api.
// The index injects every endpoint module, and an endpoint must be registered
// before an upsert can build its cache entry.
import { Api } from "metabase/api";
import type { State } from "metabase/redux/store";
import type { User } from "metabase-types/api";

type ApiState = State["metabase-api"];

export const createMockApiState = (): ApiState =>
  Api.reducer(undefined, { type: "@@INIT" });

export type QueryCacheSeed = {
  endpointName: string;
  arg?: unknown;
  value: unknown;
};

/**
 * Synchronously seed RTK Query cache entries into a `preloadedState` slice
 * for the shared `Api`, without a live store.
 * Use this to give a test the server data the app should read from the query cache.
 *
 * Building the slice via `preloadedState` keeps it synchronous and per-store:
 * no cross-test leakage, and reads resolve on the first render.
 *
 * Entries that already exist in the state are skipped, so seeding is idempotent.
 * Mock states routinely pass through seeding twice (spec setup, then render harness).
 *
 * Seeded entries register the tags their endpoint's `providesTags` computes,
 * so tag invalidation refetches or evicts them exactly like a fulfilled fetch.
 *
 * A seeded entry is `fulfilled`, so `useXQuery` hooks won't refetch on mount.
 * A test that needs to assert a fetch happened should not seed that entry.
 */
export function seedApiQueryCache(
  currentApiState: ApiState | undefined,
  entries: QueryCacheSeed[],
): ApiState {
  const apiState = currentApiState ?? createMockApiState();

  const existingEntries = Object.values(apiState.queries ?? {});
  const newEntries = entries.filter(
    ({ endpointName, arg }) =>
      !existingEntries.some(
        (entry) =>
          entry?.endpointName === endpointName &&
          JSON.stringify(entry?.originalArgs) === JSON.stringify(arg),
      ),
  );
  if (newEntries.length === 0) {
    return apiState;
  }

  return Api.reducer(
    apiState,
    Api.util.upsertQueryEntries(
      // RTK validates endpointName/value at runtime against the injected
      // endpoint registry. The cast keeps this helper endpoint-agnostic.
      newEntries as Parameters<typeof Api.util.upsertQueryEntries>[0],
    ),
  );
}

/**
 * Seed the `getCurrentUser` cache entry into an api state slice.
 * The current user is served from that cache (see `getUser`),
 * so mock states mirror their `currentUser` field into it.
 */
export const seedCurrentUserApiState = (
  apiState: ApiState,
  user: User,
): ApiState =>
  seedApiQueryCache(apiState, [
    { endpointName: "getCurrentUser", value: user },
  ]);
