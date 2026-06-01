import type { Dispatch } from "metabase/redux/store";
import {
  dispatchQueryEndpoint,
  shouldUsePivotEndpoint,
} from "metabase/services";
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
