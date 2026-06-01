import { isNative } from "metabase/common/utils/card";
import type { Dispatch } from "metabase/redux/store";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card, Dataset } from "metabase-types/api";

import { cardApi } from "./card";
import { dashboardApi } from "./dashboard";
import { embedApi } from "./embed";
import { publicApi } from "./public";

// Minimal structural view of an RTK Query endpoint. We only ever dispatch
// `.initiate(...)`, so this is all the runner and pivot map need. Declared as a
// method (not an arrow property) so RTK's concrete endpoints stay assignable.
type QueryEndpoint<Arg> = {
  initiate(arg: Arg, options?: unknown): unknown;
};

// Extracts the request-argument type a query endpoint expects.
type ArgOf<Endpoint> = Endpoint extends QueryEndpoint<infer Arg> ? Arg : never;

// Pivot tables need subtotal data the regular query endpoints don't return, so
// each query route has a dedicated pivot mirror. This maps every base endpoint
// to its pivot variant; keep it as the single source of truth for that pairing.
const PIVOT_ENDPOINTS = new Map<unknown, unknown>([
  [cardApi.endpoints.getCardQuery, cardApi.endpoints.getCardQueryPivot],
  [
    dashboardApi.endpoints.getDashboardCardQuery,
    dashboardApi.endpoints.getDashboardCardQueryPivot,
  ],
  [
    publicApi.endpoints.getPublicCardQuery,
    publicApi.endpoints.getPublicCardQueryPivot,
  ],
  [
    publicApi.endpoints.getPublicDashcardQuery,
    publicApi.endpoints.getPublicDashcardQueryPivot,
  ],
  [
    embedApi.endpoints.getEmbedCardQuery,
    embedApi.endpoints.getEmbedCardQueryPivot,
  ],
  [
    embedApi.endpoints.getEmbedDashcardQuery,
    embedApi.endpoints.getEmbedDashcardQueryPivot,
  ],
]);

/**
 * Whether `card` should be queried through the pivot endpoints. Pivot tables
 * need subtotal data the regular query endpoints don't return, so they use
 * dedicated mirror endpoints that take `pivot_rows`/`pivot_cols`.
 */
export function shouldUsePivotEndpoint(
  card: Card,
  metadata: Metadata,
): boolean {
  const question = new Question(card, metadata);
  const database = question.database();
  return (
    question.display() === "pivot" &&
    !isNative(card) &&
    // if we have metadata for the db, check if it supports pivots
    (!database || database.supportsPivots())
  );
}

/**
 * Returns the pivot variant of `endpoint` when `card` renders as a pivot table,
 * otherwise the endpoint itself. The pivot endpoint takes the same request
 * argument, so the return type matches the input.
 */
export function maybeUsePivotEndpoint<Arg>(
  endpoint: QueryEndpoint<Arg>,
  card: Card,
  metadata: Metadata,
): QueryEndpoint<Arg> {
  if (!shouldUsePivotEndpoint(card, metadata)) {
    return endpoint;
  }
  return (PIVOT_ENDPOINTS.get(endpoint) as QueryEndpoint<Arg>) ?? endpoint;
}

/**
 * Dispatches an RTK Query endpoint and wires `signal` to RTK Query's `.abort()`.
 * Translates aborts into the legacy `{ isCancelled: true }` shape so existing
 * error handling (e.g. queryErrored) keeps working. `forceRefetch` makes each
 * call hit the network rather than resolving from a stale cache entry, matching
 * the legacy fetch-and-discard behavior.
 */
export function dispatchQueryEndpoint<Arg>(
  dispatch: Dispatch,
  endpoint: QueryEndpoint<Arg>,
  requestBody: Arg,
  signal?: AbortSignal,
): Promise<Dataset> {
  // RTK's initiate() returns a thunk; dispatching it yields a result that
  // carries abort/unwrap/unsubscribe.
  const action = dispatch(
    endpoint.initiate(requestBody, { forceRefetch: true }) as never,
  ) as unknown as {
    abort?: () => void;
    unsubscribe?: () => void;
    unwrap: () => Promise<Dataset>;
  };

  let isCancelled = false;
  const onAbort = () => {
    isCancelled = true;
    action.abort?.();
  };
  // The signal may already be aborted by the time we get here (e.g. the
  // user cancelled while we were awaiting a dynamic import in the caller).
  // In that case the "abort" event already fired and a listener won't run.
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  return action
    .unwrap()
    .catch((error) => {
      if (isCancelled) {
        throw { isCancelled: true };
      }
      throw error;
    })
    .finally(() => action.unsubscribe?.());
}

/**
 * Builds a runner that selects the pivot or non-pivot variant of a query
 * endpoint for `card` and dispatches it. `signal` is wired to RTK Query's
 * abort, and aborts surface as the legacy `{ isCancelled: true }` shape so
 * existing error handling keeps working.
 */
export function makePivotAwareQueryRunner(
  dispatch: Dispatch,
  signal?: AbortSignal,
) {
  return <Endpoint extends QueryEndpoint<unknown>>(
    endpoint: Endpoint,
    card: Card,
    metadata: Metadata,
    args: ArgOf<Endpoint>,
  ): Promise<Dataset> =>
    dispatchQueryEndpoint(
      dispatch,
      maybeUsePivotEndpoint(endpoint, card, metadata),
      args,
      signal,
    );
}
