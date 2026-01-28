import _ from "underscore";

import api, { DELETE, GET, POST, PUT } from "metabase/lib/api";
import { PLUGIN_API, PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { isNative } from "metabase-lib/v1/queries/utils/card";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";

import { getIsEmbedPreview } from "./get-is-embed-preview";

export const internalBase = "/api";
export const publicBase = "/api/public";
// use different endpoints for embed previews
export function getEmbedBase() {
  return getIsEmbedPreview() ? "/api/preview_embed" : "/api/embed";
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

// Pivot tables need extra data beyond what's described in the MBQL query itself.
// To fetch that extra data we rely on specific APIs for pivot tables that mirrow the normal endpoints.
// Those endpoints take the query along with `pivot_rows` and `pivot_cols` to return the subtotal data.
// If we add breakout/grouping sets to MBQL in the future we can remove this API switching.
export function maybeUsePivotEndpoint(api, card, metadata) {
  const question = new Question(card, metadata);

  // we need to pass pivot_rows, pivot_cols, and totals settings only for ad-hoc queries endpoints
  // in other cases the BE extracts these options from the viz settings
  function wrap(api) {
    return (params, ...rest) => {
      const { pivot_rows, pivot_cols, show_row_totals, show_column_totals } =
        getPivotOptions(question);
      return api(
        {
          ...params,
          pivot_rows,
          pivot_cols,
          show_row_totals,
          show_column_totals,
        },
        ...rest,
      );
    };
  }

  if (
    question.display() !== "pivot" ||
    isNative(card) ||
    // if we have metadata for the db, check if it supports pivots
    (question.database() && !question.database().supportsPivots())
  ) {
    return api;
  }

  const mapping = [
    [MetabaseApi.dataset, MetabaseApi.dataset_pivot, { wrap: true }],
    [CardApi.query, CardApi.query_pivot],
    [DashboardApi.cardQuery, DashboardApi.cardQueryPivot],
    [PublicApi.cardQuery, PublicApi.cardQueryPivot],
    [PublicApi.dashboardCardQuery, PublicApi.dashboardCardQueryPivot],
    [EmbedApi.cardQuery, EmbedApi.cardQueryPivot],
    [EmbedApi.dashboardCardQuery, EmbedApi.dashboardCardQueryPivot],
  ];
  for (const [from, to, options = {}] of mapping) {
    if (api === from) {
      return options.wrap ? wrap(to) : to;
    }
  }
  return api;
}

/**
 * @param {*} question
 * @param {object} param
 */
export async function runQuestionQuery(
  question,
  {
    cancelDeferred,
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
      await maybeUsePivotEndpoint(
        dashboardId ? DashboardApi.cardQuery : CardApi.query,
        card,
        question.metadata(),
      )(queryParams, {
        cancelled: cancelDeferred.promise,
      }),
    ];
  }

  const getDatasetQueryResult = (datasetQuery) => {
    const datasetQueryWithParameters = { ...datasetQuery, parameters };
    return maybeUsePivotEndpoint(
      MetabaseApi.dataset,
      card,
      question.metadata(),
    )(
      datasetQueryWithParameters,
      cancelDeferred
        ? {
            cancelled: cancelDeferred.promise,
          }
        : {},
    );
  };

  const datasetQueries = [question.datasetQuery()];

  return Promise.all(datasetQueries.map(getDatasetQueryResult));
}

export const CardApi = {
  get: GET("/api/card/:cardId"),
  update: PUT("/api/card/:id"),
  query: POST("/api/card/:cardId/query"),
  query_pivot: POST("/api/card/pivot/:cardId/query"),
  // related
  compatibleCards: GET("/api/card/:cardId/series"),
  parameterValues: GET("/api/card/:cardId/params/:paramId/values"),
  parameterSearch: GET("/api/card/:cardId/params/:paramId/search/:query"),
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
  dashboard: GET("/api/automagic-dashboards/:subPath", {
    // this prevents the `subPath` parameter from being URL encoded
    raw: { subPath: true },
  }),
};

export const MetabaseApi = {
  db_usage_info: GET("/api/database/:dbId/usage_info"),
  tableAppendCSV: POST("/api/table/:tableId/append-csv", {
    formData: true,
    fetch: true,
  }),
  tableReplaceCSV: POST("/api/table/:tableId/replace-csv", {
    formData: true,
    fetch: true,
  }),
  dataset: POST("/api/dataset"),
  dataset_pivot: POST("/api/dataset/pivot"),

  // to support audit app  allow the endpoint to be provided in the query
  datasetEndpoint: POST("/api/:endpoint", {
    // this prevents the `endpoint` parameter from being URL encoded
    raw: { endpoint: true },
  }),
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
  preview_card: GET("/api/pulse/preview_card_info/:id"),
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

export const UtilApi = {
  password_check: POST("/api/session/password-check"),
  random_token: GET("/api/util/random_token"),
  logs: GET("/api/logger/logs"),
  bug_report_details: GET("/api/bug-reporting/details"),
  get_connection_pool_details_url: () => {
    // this one does not need an HTTP verb because it's opened as an external link
    // and it can be deployed at subpath
    const path = "/api/bug-reporting/connection-pool-details";
    const { href } = new URL(api.basename + path, location.origin);

    return href;
  },
};

export function setPublicQuestionEndpoints(uuid) {
  const encodedUuid = encodeURIComponent(uuid);
  setCardEndpoints({ base: publicBase, encodedUuid });
}

export function setPublicDashboardEndpoints(uuid) {
  const encodedUuid = encodeURIComponent(uuid);
  setDashboardEndpoints({ base: publicBase, encodedUuid });
}

/**
 * @param token {string}
 */
export function setEmbedQuestionEndpoints(token) {
  const encodedToken = encodeURIComponent(token);
  setCardEndpoints({ base: getEmbedBase(), encodedToken });
  PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(encodedToken);
}

/**
 * @param token {string}
 */
export function setEmbedDashboardEndpoints(token) {
  const encodedToken = encodeURIComponent(token);
  setDashboardEndpoints({ base: getEmbedBase(), encodedToken });
  PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(encodedToken);
}

function GET_with(url, omitKeys) {
  return (data, options) => GET(url)({ ..._.omit(data, omitKeys) }, options);
}

function setCardEndpoints({ base, encodedUuid, encodedToken }) {
  const prefix = `${base}/card/${encodedUuid ?? encodedToken}`;

  // RTK query
  PLUGIN_API.getRemappedCardParameterValueUrl = (_cardId, parameterId) =>
    `${prefix}/params/${encodeURIComponent(parameterId)}/remapping`;

  // legacy API
  CardApi.parameterValues = GET_with(`${prefix}/params/:paramId/values`, [
    "cardId",
  ]);
  CardApi.parameterSearch = GET_with(
    `${prefix}/params/:paramId/search/:query`,
    ["cardId"],
  );
}

function setDashboardEndpoints({ base, encodedUuid, encodedToken }) {
  const prefix = `${base}/dashboard/${encodedUuid ?? encodedToken}`;

  // RTK query
  PLUGIN_API.getRemappedDashboardParameterValueUrl = (
    _dashboardId,
    parameterId,
  ) => `${prefix}/params/${encodeURIComponent(parameterId)}/remapping`;

  // legacy API
  DashboardApi.parameterValues = GET_with(`${prefix}/params/:paramId/values`, [
    "dashId",
  ]);
  DashboardApi.parameterSearch = GET_with(
    `${prefix}/params/:paramId/search/:query`,
    ["dashId"],
  );
}

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
