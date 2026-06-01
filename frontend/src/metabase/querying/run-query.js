import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";

/**
 * Handles API errors for query endpoints. For 4xx errors from streaming query
 * endpoints, the error response body contains the actual error data that should
 * be displayed (just like the old 202-with-error-in-body behavior). This function
 * converts 4xx errors into successful responses with the error data.
 *
 * @param {Promise} apiPromise - The API promise to handle
 * @returns {Promise} The result or error data
 */
async function handleQueryApiError(apiPromise) {
  try {
    return await apiPromise;
  } catch (error) {
    // For 4xx errors, treat the error response body as a successful response
    // (maintaining compatibility with the old 202-with-error-in-body behavior)
    if (
      error &&
      typeof error === "object" &&
      error.status >= 400 &&
      error.status < 500 &&
      error.data
    ) {
      // The QP returns a structured `{ error, error_type, ... }` body, but
      // plainer endpoints (e.g. `/api/embed/*` API-level checks) return a
      // plain-text body. Normalize so callers can rely on a `{ error, ... }`
      // shape and don't fall through to the empty state (EMB-1659).
      if (typeof error.data === "string") {
        return { error: error.data, status: error.status };
      }
      return error.data;
    }
    // For 5xx and other errors, re-throw
    throw error;
  }
}

// Dispatches the RTK `datasetApi` ad-hoc query endpoint (pivot or non-pivot).
let adhocDatasetQueryCounter = 0;
export async function runAdhocDatasetQuery(
  dispatch,
  card,
  metadata,
  body,
  signal,
) {
  // Dynamic import to avoid a module-init cycle: the RTK api modules transitively
  // pull in the redux store graph, which (far downstream) imports this module's
  // consumers. Deferring resolution until call time means the cycle closes only
  // after every module has finished initializing.
  const [{ datasetApi }, { shouldUsePivotEndpoint, dispatchQueryEndpoint }] =
    await Promise.all([
      import("metabase/api/dataset"),
      import("metabase/api/query-endpoints"),
    ]);
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
// route (and their pivot variants). Guest embeds rely on the legacy-client
// `onBeforeRequest` middleware (which RTK requests still pass through) rewriting
// the card route to `/api/embed/card/:token/query` when `token` is in the body.
async function runSavedCardQuery(
  dispatch,
  question,
  { parameters, ignoreCache, collectionPreview, token, queryParamsOverride },
  signal,
) {
  const [{ makePivotAwareQueryRunner }, { cardApi }, { dashboardApi }] =
    await Promise.all([
      import("metabase/api/query-endpoints"),
      import("metabase/api/card"),
      import("metabase/api/dashboard"),
    ]);

  const card = question.card();
  const metadata = question.metadata();
  const { dashboardId, dashcardId } = question.getDashboardProps();
  const runQuery = makePivotAwareQueryRunner(dispatch, signal);

  const body = {
    ignore_cache: ignoreCache,
    collection_preview: collectionPreview,
    parameters,
    ...(token ? { token } : {}),
    ...queryParamsOverride,
  };

  if (dashboardId != null) {
    return runQuery(
      dashboardApi.endpoints.getDashboardCardQuery,
      card,
      metadata,
      { dashboardId, dashcardId, cardId: question.id(), ...body },
    );
  }

  return runQuery(cardApi.endpoints.getCardQuery, card, metadata, {
    cardId: question.id(),
    ...body,
  });
}

/**
 * @param {*} question
 * @param {object} param
 */
export async function runQuestionQuery(
  question,
  {
    dispatch,
    signal,
    isDirty = false,
    token,
    ignoreCache = false,
    collectionPreview = false,
    // Ability to override or add extra query params to the request, used by Embedding SDK
    queryParamsOverride = {},
  } = {},
) {
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
