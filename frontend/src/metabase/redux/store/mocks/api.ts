// Import the `metabase/api` index (not the bare `Api` from ./api): it injects
// every endpoint module, and an endpoint must be registered before an upsert
// for it can build its cache entry.
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
 * Synchronously seed RTK Query cache entries into a `preloadedState` slice for
 * the shared `Api`, without a live store. Use this to give a test server data
 * that the app reads from the query cache.
 *
 * Building the slice via `preloadedState` (rather than dispatching into a built
 * store) keeps it fully synchronous and per-store: no cross-test leakage, and
 * reads resolve on the first render.
 *
 * Entries that already exist in the state are skipped. This is not just an
 * optimization: re-upserting an existing entry leaves it stuck `pending` (the
 * second upsert keeps the first requestId, so RTK rejects the fulfilled
 * write), and a forever-pending query silently defers every `invalidateTags`
 * under the api's default "delayed" invalidation behavior. Mock states
 * routinely pass through seeding twice (spec setup + render harness).
 *
 * Note: a seeded entry is `fulfilled`, so `useXQuery` hooks won't refetch on
 * mount. A test that needs to assert a fetch happened should drive the query
 * explicitly (or not seed) instead.
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

  // endpointName/value are validated at runtime by RTK against the injected
  // endpoint registry; the cast keeps this helper endpoint-agnostic.
  return Api.reducer(
    apiState,
    Api.util.upsertQueryEntries(
      newEntries as Parameters<typeof Api.util.upsertQueryEntries>[0],
    ),
  );
}

/**
 * Seed the `getCurrentUser` cache entry into an api state slice. The current
 * user is served from that cache (see `getUser`), so mock states mirror their
 * `currentUser` field into it.
 */
export const seedCurrentUserApiState = (
  apiState: ApiState,
  user: User,
): ApiState =>
  seedApiQueryCache(apiState, [
    { endpointName: "getCurrentUser", value: user },
  ]);
