import { DELETE, GET, POST, PUT } from "metabase/api/legacy-client";
import { isNative } from "metabase/common/utils/card";
import { isEmbedPreview } from "metabase/embedding/config";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";

export const internalBase = "/api";
export const publicBase = "/api/public";
// use different endpoints for embed previews
export function getEmbedBase() {
  return isEmbedPreview() ? "/api/preview_embed" : "/api/embed";
}

export const ActivityApi = {
  most_recently_viewed_dashboard: GET(
    "/api/activity/most_recently_viewed_dashboard",
  ),
};

// only available with token loaded
export const GTAPApi = {
  list: GET("/api/mt/gtap"),
  attributes: GET("/api/mt/user/attributes"),
  validate: POST("/api/mt/gtap/validate"),
};

export const StoreApi = {
  tokenStatus: GET("/api/premium-features/token/status"),
};

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

// Pivot tables need extra data beyond what's described in the MBQL query itself.
// To fetch that extra data we rely on specific APIs for pivot tables that mirrow the normal endpoints.
// Those endpoints take the query along with `pivot_rows` and `pivot_cols` to return the subtotal data.
// If we add breakout/grouping sets to MBQL in the future we can remove this API switching.
export function shouldUsePivotEndpoint(card, metadata) {
  const question = new Question(card, metadata);
  return (
    question.display() === "pivot" &&
    !isNative(card) &&
    // if we have metadata for the db, check if it supports pivots
    (!question.database() || question.database().supportsPivots())
  );
}

export function maybeUsePivotEndpoint(api, card, metadata) {
  if (!shouldUsePivotEndpoint(card, metadata)) {
    return api;
  }

  const mapping = [
    [CardApi.query, CardApi.query_pivot],
    [DashboardApi.cardQuery, DashboardApi.cardQueryPivot],
    [PublicApi.cardQuery, PublicApi.cardQueryPivot],
    [PublicApi.dashboardCardQuery, PublicApi.dashboardCardQueryPivot],
    [EmbedApi.cardQuery, EmbedApi.cardQueryPivot],
    [EmbedApi.dashboardCardQuery, EmbedApi.dashboardCardQueryPivot],
  ];
  for (const [from, to] of mapping) {
    if (api === from) {
      return to;
    }
  }
  return api;
}

// Dispatches the RTK `datasetApi` ad-hoc query endpoint (pivot or non-pivot)
// and wires the `signal` to RTK Query's `.abort()`. On abort it surfaces the
// standard `DOMException` AbortError so existing error-handling code keeps
// working via `isAbortError(error)`.
let adhocDatasetQueryCounter = 0;
export async function runAdhocDatasetQuery(
  dispatch,
  card,
  metadata,
  body,
  signal,
) {
  // Dynamic import to avoid a module-init cycle: `metabase/api/dataset` pulls
  // in `metabase/api` → `metabase/redux/user` → `metabase/redux/query-builder`
  // → `metabase/services` (this module). Deferring resolution until call time
  // means the cycle closes only after every module has finished initializing.
  const { datasetApi } = await import("metabase/api/dataset");
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

  const action = dispatch(
    endpoint.initiate(requestBody, { forceRefetch: true }),
  );

  let isCancelled = false;
  const onAbort = () => {
    isCancelled = true;
    action.abort?.();
  };
  // The signal may already be aborted by the time we get here (e.g. the
  // user cancelled while we were awaiting the dynamic import above). In
  // that case the "abort" event already fired and a listener won't run.
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  return action
    .unwrap()
    .catch((error) => {
      if (isCancelled) {
        throw signal?.reason ?? new DOMException("Aborted", "AbortError");
      }
      throw error;
    })
    .finally(() => action.unsubscribe?.());
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
    const { dashboardId, dashcardId } = question.getDashboardProps();

    const queryParams = {
      ...(token ? { token } : { cardId: question.id() }),
      dashboardId,
      dashcardId,
      ignore_cache: ignoreCache,
      collection_preview: collectionPreview,
      parameters,
      ...queryParamsOverride,
    };

    return [
      await handleQueryApiError(
        maybeUsePivotEndpoint(
          dashboardId ? DashboardApi.cardQuery : CardApi.query,
          card,
          question.metadata(),
        )(queryParams, {
          signal,
        }),
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

export const CardApi = {
  query: POST("/api/card/:cardId/query"),
  query_pivot: POST("/api/card/pivot/:cardId/query"),
};

export const DashboardApi = {
  get: GET("/api/dashboard/:dashId"),
  parameterValues: GET("/api/dashboard/:dashId/params/:paramId/values"),
  parameterSearch: GET("/api/dashboard/:dashId/params/:paramId/search/:query"),
  validFilterFields: GET("/api/dashboard/params/valid-filter-fields"),
  cardQuery: POST(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query",
  ),
  cardQueryPivot: POST(
    "/api/dashboard/pivot/:dashboardId/dashcard/:dashcardId/card/:cardId/query",
  ),
};

export const CollectionsApi = {
  get: GET("/api/collection/:id"),
  graph: GET("/api/collection/graph"),
  updateGraph: PUT("/api/collection/graph?skip-graph=true"),
};

const PIVOT_PUBLIC_PREFIX = `${publicBase}/pivot/`;

export const PublicApi = {
  action: GET(`${publicBase}/action/:uuid`),
  executeDashcardAction: POST(
    `${publicBase}/dashboard/:dashboardId/dashcard/:dashcardId/execute`,
  ),
  executeAction: POST(`${publicBase}/action/:uuid/execute`),
  card: GET(`${publicBase}/card/:uuid`),
  cardQuery: GET(`${publicBase}/card/:uuid/query`),
  cardQueryPivot: GET(PIVOT_PUBLIC_PREFIX + "card/:uuid/query"),
  dashboard: GET(`${publicBase}/dashboard/:uuid`),
  dashboardCardQuery: GET(
    `${publicBase}/dashboard/:uuid/dashcard/:dashcardId/card/:cardId`,
  ),
  dashboardCardQueryPivot: GET(
    PIVOT_PUBLIC_PREFIX + "dashboard/:uuid/dashcard/:dashcardId/card/:cardId",
  ),
  prefetchDashcardValues: GET(
    `${publicBase}/dashboard/:dashboardId/dashcard/:dashcardId/execute`,
  ),
  document: GET(`/api/public/document/:uuid`),
  documentCardQuery: GET(`/api/public/document/:uuid/card/:cardId`),
};

export const EmbedApi = {
  card: GET(getEmbedBase() + "/card/:token"),
  cardQuery: GET(getEmbedBase() + "/card/:token/query"),
  cardQueryPivot: GET(getEmbedBase() + "/pivot/card/:token/query"),
  dashboard: GET(getEmbedBase() + "/dashboard/:token"),
  dashboardCardQuery: GET(
    getEmbedBase() + "/dashboard/:token/dashcard/:dashcardId/card/:cardId",
  ),
  dashboardCardQueryPivot: GET(
    getEmbedBase() +
      "/pivot/dashboard/:token/dashcard/:dashcardId/card/:cardId",
  ),
};

export const AutoApi = {
  // `:subPath*` keeps slashes in subPath unencoded (multi-segment path).
  dashboard: GET("/api/automagic-dashboards/:subPath*"),
};

export const ParameterApi = {
  parameterValues: POST("/api/dataset/parameter/values"),
  parameterSearch: POST("/api/dataset/parameter/search/:query"),
};

export const ModerationReviewApi = {
  create: POST("/api/moderation-review"),
  update: PUT("/api/moderation-review/:id"),
};

export const PulseApi = {
  list: GET("/api/pulse"),
  create: POST("/api/pulse"),
  get: GET("/api/pulse/:pulseId"),
  update: PUT("/api/pulse/:id"),
  test: POST("/api/pulse/test"),
  form_input: GET("/api/pulse/form_input"),
  unsubscribe: DELETE("/api/pulse/:id/subscription"),
};

/// this in unauthenticated, for letting people who are not logged in unsubscribe from Alerts/DashboardSubscriptions
export const PulseUnsubscribeApi = {
  unsubscribe: POST("/api/pulse/unsubscribe"),
  undo_unsubscribe: POST("/api/pulse/unsubscribe/undo"),
};

// also unauthenticated
export const NotificationUnsubscribeApi = {
  unsubscribe: POST("/api/notification/unsubscribe"),
  undo_unsubscribe: POST("/api/notification/unsubscribe/undo"),
};

export const RevisionsApi = {
  get: GET("/api/revision/:entity/:id"),
};

export const SessionApi = {
  create: POST("/api/session"),
  createWithGoogleAuth: POST("/api/session/google_auth"),
  delete: DELETE("/api/session"),
  slo: POST("/auth/sso/logout"),
  forgot_password: POST("/api/session/forgot_password"),
  reset_password: POST("/api/session/reset_password"),
};

export const SettingsApi = {
  list: GET("/api/setting"),
  put: PUT("/api/setting/:key"),
  putAll: PUT("/api/setting"),
};

export const PermissionsApi = {
  graph: GET("/api/permissions/graph"),
  graphForGroup: GET("/api/permissions/graph/group/:groupId"),
  graphForDB: GET("/api/permissions/graph/db/:databaseId"),
  updateGraph: PUT("/api/permissions/graph"),
};

export const PersistedModelsApi = {
  enablePersistence: POST("/api/persist/enable"),
  disablePersistence: POST("/api/persist/disable"),
  setRefreshSchedule: POST("/api/persist/set-refresh-schedule"),
};

export const SetupApi = {
  create: POST("/api/setup"),
};

export const UserApi = {
  list: GET("/api/user/recipients"),
  current: GET("/api/user/current"),
  update_qbnewb: PUT("/api/user/:id/modal/qbnewb"),
};

export const FrontendErrorsApi = {
  report: POST("/api/frontend-errors"),
};

export const ActionsApi = {
  execute: POST("/api/action/:id/execute"),
  prefetchValues: GET("/api/action/:id/execute"),
  prefetchDashcardValues: GET(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/execute",
  ),
  executeDashcardAction: POST(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/execute",
  ),
};
