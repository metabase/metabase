import api, { DELETE, GET, POST, PUT } from "metabase/lib/api";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { PLUGIN_API } from "metabase/plugins";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { isNative } from "metabase-lib/v1/queries/utils/card";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";

// use different endpoints for embed previews
const embedBase = IS_EMBED_PREVIEW ? "/api/preview_embed" : "/api/embed";

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

  function wrap(api) {
    return (params, ...rest) => {
      const { pivot_rows, pivot_cols } = getPivotOptions(question);
      return api({ ...params, pivot_rows, pivot_cols }, ...rest);
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
    [CardApi.query, CardApi.query_pivot],
    [DashboardApi.cardQuery, DashboardApi.cardQueryPivot],
    [MetabaseApi.dataset, MetabaseApi.dataset_pivot],
    [PublicApi.cardQuery, PublicApi.cardQueryPivot],
    [PublicApi.dashboardCardQuery, PublicApi.dashboardCardQueryPivot],
    [EmbedApi.cardQuery, EmbedApi.cardQueryPivot],
    [EmbedApi.dashboardCardQuery, EmbedApi.dashboardCardQueryPivot],
  ];
  for (const [from, to] of mapping) {
    if (api === from) {
      return wrap(to);
    }
  }
  return api;
}

export async function runQuestionQuery(
  question,
  {
    cancelDeferred,
    isDirty = false,
    ignoreCache = false,
    collectionPreview = false,
  } = {},
) {
  const canUseCardApiEndpoint = !isDirty && question.isSaved();
  const parameters = normalizeParameters(
    question.parameters({ collectionPreview }),
  );
  const card = question.card();

  if (canUseCardApiEndpoint) {
    const { dashboardId, dashcardId } = card;

    const queryParams = {
      cardId: question.id(),
      dashboardId,
      dashcardId,
      ignore_cache: ignoreCache,
      collection_preview: collectionPreview,
      parameters,
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
};

export const DashboardApi = {
  get: GET("/api/dashboard/:dashId"),
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

const PIVOT_PUBLIC_PREFIX = "/api/public/pivot/";

export const PublicApi = {
  action: GET("/api/public/action/:uuid"),
  executeDashcardAction: POST(
    "/api/public/dashboard/:dashboardId/dashcard/:dashcardId/execute",
  ),
  executeAction: POST("/api/public/action/:uuid/execute"),
  card: GET("/api/public/card/:uuid"),
  cardQuery: GET("/api/public/card/:uuid/query"),
  cardQueryPivot: GET(PIVOT_PUBLIC_PREFIX + "card/:uuid/query"),
  dashboard: GET("/api/public/dashboard/:uuid"),
  dashboardCardQuery: GET(
    "/api/public/dashboard/:uuid/dashcard/:dashcardId/card/:cardId",
  ),
  dashboardCardQueryPivot: GET(
    PIVOT_PUBLIC_PREFIX + "dashboard/:uuid/dashcard/:dashcardId/card/:cardId",
  ),
  prefetchDashcardValues: GET(
    "/api/public/dashboard/:dashboardId/dashcard/:dashcardId/execute",
  ),
};

export const EmbedApi = {
  card: GET(embedBase + "/card/:token"),
  cardQuery: GET(embedBase + "/card/:token/query"),
  cardQueryPivot: GET(embedBase + "/pivot/card/:token/query"),
  dashboard: GET(embedBase + "/dashboard/:token"),
  dashboardCardQuery: GET(
    embedBase + "/dashboard/:token/dashcard/:dashcardId/card/:cardId",
  ),
  dashboardCardQueryPivot: GET(
    embedBase + "/pivot/dashboard/:token/dashcard/:dashcardId/card/:cardId",
  ),
};

export const AutoApi = {
  dashboard: GET("/api/automagic-dashboards/:subPath", {
    // this prevents the `subPath` parameter from being URL encoded
    raw: { subPath: true },
  }),
};

export const EmailApi = {
  updateSettings: PUT("/api/email"),
  sendTest: POST("/api/email/test"),
  clear: DELETE("/api/email"),
};

export const SlackApi = {
  getManifest: GET("/api/slack/manifest"),
  updateSettings: PUT("/api/slack/settings"),
};

export const LdapApi = {
  updateSettings: PUT("/api/ldap/settings"),
};

export const SamlApi = {
  updateSettings: PUT("/api/saml/settings"),
};

export const GoogleApi = {
  updateSettings: PUT("/api/google/settings"),
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
  groups: GET("/api/permissions/group"),
  groupDetails: GET("/api/permissions/group/:id"),
  graph: GET("/api/permissions/graph"),
  graphForGroup: GET("/api/permissions/graph/group/:groupId"),
  graphForDB: GET("/api/permissions/graph/db/:databaseId"),
  updateGraph: PUT("/api/permissions/graph"),
  memberships: GET("/api/permissions/membership"),
  createMembership: POST("/api/permissions/membership"),
  deleteMembership: DELETE("/api/permissions/membership/:id"),
  updateMembership: PUT("/api/permissions/membership/:id"),
  clearGroupMembership: PUT("/api/permissions/membership/:id/clear"),
  updateGroup: PUT("/api/permissions/group/:id"),
  deleteGroup: DELETE("/api/permissions/group/:id"),
};

export const PersistedModelsApi = {
  enablePersistence: POST("/api/persist/enable"),
  disablePersistence: POST("/api/persist/disable"),
  setRefreshSchedule: POST("/api/persist/set-refresh-schedule"),
};

export const SetupApi = {
  create: POST("/api/setup"),
  user_defaults: GET("/api/setup/user_defaults"),
};

export const UserApi = {
  list: GET("/api/user/recipients"),
  current: GET("/api/user/current"),
  update_qbnewb: PUT("/api/user/:id/modal/qbnewb"),
};

export const UtilApi = {
  password_check: POST("/api/util/password_check"),
  random_token: GET("/api/util/random_token"),
  logs: GET("/api/util/logs"),
  bug_report_details: GET("/api/util/bug_report_details"),
  get_connection_pool_details_url: () => {
    // this one does not need an HTTP verb because it's opened as an external link
    // and it can be deployed at subpath
    const path = "/api/util/diagnostic_info/connection_pool_info";
    const { href } = new URL(api.basename + path, location.origin);

    return href;
  },
};

export const GeoJSONApi = {
  load: GET("/api/geojson"),
  get: GET("/api/geojson/:id"),
};

export function setPublicQuestionEndpoints(uuid) {
  setCardEndpoints(`/api/public/card/${encodeURIComponent(uuid)}`);
}

export function setPublicDashboardEndpoints(uuid) {
  setDashboardEndpoints(`/api/public/dashboard/${encodeURIComponent(uuid)}`);
}

export function setEmbedQuestionEndpoints(token) {
  if (!IS_EMBED_PREVIEW) {
    setCardEndpoints(`/api/embed/card/${encodeURIComponent(token)}`);
  }
}

export function setEmbedDashboardEndpoints(token) {
  if (!IS_EMBED_PREVIEW) {
    setDashboardEndpoints(`/api/embed/dashboard/${encodeURIComponent(token)}`);
  } else {
    setEmbedPreviewDashboardEndpoints(embedBase);
  }
}

function setFieldEndpoints(prefix) {
  PLUGIN_API.getFieldValuesUrl = (fieldId) =>
    `${prefix}/field/${fieldId}/values`;
  PLUGIN_API.getSearchFieldValuesUrl = (fieldId, searchFieldId) =>
    `${prefix}/field/${fieldId}/search/${searchFieldId}`;
  PLUGIN_API.getRemappedFieldValueUrl = (fieldId, remappedFieldId) =>
    `${prefix}/field/${fieldId}/remapping/${remappedFieldId}`;
}

function setCardEndpoints(prefix) {
  setFieldEndpoints(prefix);
  PLUGIN_API.getCardParameterValuesUrl = (_cardId, parameterId) =>
    `${prefix}/params/${encodeURIComponent(parameterId)}/values`;
  PLUGIN_API.getSearchCardParameterValuesUrl = (_cardId, parameterId, query) =>
    `${prefix}/params/${encodeURIComponent(parameterId)}/search/${encodeURIComponent(query)}`;
}

function setDashboardEndpoints(prefix) {
  setFieldEndpoints(prefix);
  PLUGIN_API.getDashboardParameterValuesUrl = (_dashboardId, parameterId) =>
    `${prefix}/params/${encodeURIComponent(parameterId)}/values`;
  PLUGIN_API.getSearchDashboardParameterValuesUrl = (
    _dashboardId,
    parameterId,
    query,
  ) =>
    `${prefix}}/params/${encodeURIComponent(parameterId)}/search/${encodeURIComponent(query)}`;
}

function setEmbedPreviewDashboardEndpoints(prefix) {
  PLUGIN_API.getDashboardParameterValuesUrl = (_dashboardId, parameterId) =>
    `${prefix}/params/${encodeURIComponent(parameterId)}/values`;
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

export const CacheConfigApi = {
  list: GET("/api/cache"),
  update: PUT("/api/cache"),
  delete: DELETE("/api/cache"),
  invalidate: POST("/api/cache/invalidate"),
};
