import { cardApi } from "metabase/api/card";
import { dashboardApi } from "metabase/api/dashboard";
import { datasetApi } from "metabase/api/dataset";
import {
  dispatchQueryEndpoint,
  makePivotAwareQueryRunner,
  shouldUsePivotEndpoint,
} from "metabase/api/query-endpoints";
import type { Dispatch } from "metabase/redux/store";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";
import type {
  Card,
  CardQueryRequest,
  DashboardCardQueryRequest,
  Dataset,
  DatasetQuery,
} from "metabase-types/api";

type RunQuestionQueryOptions = {
  dispatch: Dispatch;
  signal?: AbortSignal;
  isDirty?: boolean;
  token?: string | null;
  ignoreCache?: boolean;
  collectionPreview?: boolean;
  // Ability to override or add extra query params to the request, used by Embedding SDK
  queryParamsOverride?: Record<string, unknown>;
};

type SavedCardQueryOptions = {
  parameters: unknown[];
  ignoreCache?: boolean;
  collectionPreview?: boolean;
  token?: string | null;
  queryParamsOverride?: Record<string, unknown>;
};

/**
 * Handles API errors for query endpoints. For 4xx errors from streaming query
 * endpoints, the error response body contains the actual error data that should
 * be displayed (just like the old 202-with-error-in-body behavior). This function
 * converts 4xx errors into successful responses with the error data.
 */
async function handleQueryApiError(
  apiPromise: Promise<Dataset>,
): Promise<Dataset> {
  try {
    return await apiPromise;
  } catch (error) {
    // For 4xx errors, treat the error response body as a successful response
    // (maintaining compatibility with the old 202-with-error-in-body behavior)
    if (
      error != null &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500 &&
      "data" in error &&
      error.data
    ) {
      // The QP returns a structured `{ error, error_type, ... }` body, but
      // plainer endpoints (e.g. `/api/embed/*` API-level checks) return a
      // plain-text body. Normalize so callers can rely on a `{ error, ... }`
      // shape and don't fall through to the empty state (EMB-1659).
      if (typeof error.data === "string") {
        return {
          error: error.data,
          status: error.status,
        } as unknown as Dataset;
      }
      return error.data as Dataset;
    }
    // For 5xx and other errors, re-throw
    throw error;
  }
}

// Dispatches the RTK `datasetApi` ad-hoc query endpoint (pivot or non-pivot).
let adhocDatasetQueryCounter = 0;
export function runAdhocDatasetQuery(
  dispatch: Dispatch,
  card: Card,
  metadata: Metadata,
  body: DatasetQuery & { parameters?: unknown[]; ignore_cache?: boolean },
  signal?: AbortSignal,
): Promise<Dataset> {
  const isPivot = shouldUsePivotEndpoint(card, metadata);
  // Disambiguate the RTK cache key so two callers running the same MBQL
  // query get independent cache entries and abort signals. Without this,
  // one caller cancelling would abort the shared in-flight request for
  // every co-subscribed caller. `_refetchDeps` is stripped from the body
  // before it hits the server.
  const requestBody = {
    ...(isPivot
      ? { ...body, ...getPivotOptions(new Question(card, metadata)) }
      : body),
    _refetchDeps: ++adhocDatasetQueryCounter,
  };
  const endpoint = isPivot
    ? datasetApi.endpoints.getAdhocPivotQuery
    : datasetApi.endpoints.getAdhocQuery;

  return dispatchQueryEndpoint(dispatch, endpoint, requestBody, signal);
}

// Dispatches the RTK saved-card query endpoint, picking the card vs. dashcard
// route (and their pivot variants). Guest embeds rely on the `onBeforeRequest`
// middleware (which RTK requests pass through) rewriting the card route to
// `/api/embed/card/:token/query` when `token` is in the body.
let savedCardQueryCounter = 0;
function runSavedCardQuery(
  dispatch: Dispatch,
  question: Question,
  {
    parameters,
    ignoreCache,
    collectionPreview,
    token,
    queryParamsOverride,
  }: SavedCardQueryOptions,
  signal?: AbortSignal,
): Promise<Dataset> {
  const card = question.card();
  const metadata = question.metadata();
  const { dashboardId, dashcardId } = question.getDashboardProps();
  const runQuery = makePivotAwareQueryRunner(dispatch, signal);

  const body = {
    ignore_cache: ignoreCache,
    collection_preview: collectionPreview,
    parameters,
    // Disambiguate the RTK cache key so two callers running the same saved card
    // don't co-subscribe to one in-flight request — otherwise one caller
    // aborting its query (e.g. the SDK cancelling the previous run on every
    // re-run) aborts every co-subscriber's query too. Stripped from the body
    // before it hits the server. Mirrors `runAdhocDatasetQuery`.
    _refetchDeps: ++savedCardQueryCounter,
    // `token` and `cardId` identify the card in mutually exclusive ways, so we
    // send only one. Guest and embedded requests carry a `token`: the
    // `onBeforeRequest` middleware rewrites the request to the matching
    // `/api/embed/...` route, discarding
    // the `:cardId` path segment. Authenticated requests carry a `cardId`.
    // The casts below are needed because the shared request types require
    // `cardId`; we keep that contract strict for every other (authenticated)
    // caller and override it only here, on the guest-embed path.
    ...(token ? { token } : { cardId: question.id() }),
    ...queryParamsOverride,
  };

  if (dashboardId != null && dashcardId != null) {
    return runQuery(
      dashboardApi.endpoints.getDashboardCardQuery,
      card,
      metadata,
      {
        dashboardId,
        dashcardId,
        ...body,
      } as DashboardCardQueryRequest,
    );
  }

  return runQuery(
    cardApi.endpoints.getCardQuery,
    card,
    metadata,
    body as CardQueryRequest,
  );
}

export async function runQuestionQuery(
  question: Question,
  {
    dispatch,
    signal,
    isDirty = false,
    token,
    ignoreCache = false,
    collectionPreview = false,
    queryParamsOverride = {},
  }: RunQuestionQueryOptions,
): Promise<[Dataset]> {
  const canUseCardApiEndpoint = !isDirty && question.isSaved();
  const parameters = normalizeParameters(
    question.parameters({ collectionPreview }),
  );
  const card = question.card();

  if (canUseCardApiEndpoint) {
    return [
      await handleQueryApiError(
        runSavedCardQuery(
          dispatch,
          question,
          {
            parameters,
            ignoreCache,
            collectionPreview,
            token,
            queryParamsOverride,
          },
          signal,
        ),
      ),
    ];
  }

  return [
    await handleQueryApiError(
      runAdhocDatasetQuery(
        dispatch,
        card,
        question.metadata(),
        { ...question.datasetQuery(), parameters },
        signal,
      ),
    ),
  ];
}
