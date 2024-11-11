import _ from "underscore";

import api, { DELETE, GET, POST, PUT } from "metabase/lib/api";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { isNative } from "metabase-lib/v1/queries/utils/card";
import { getPivotOptions } from "metabase-lib/v1/queries/utils/pivot";

// use different endpoints for embed previews
const embedBase = IS_EMBED_PREVIEW ? "/api/preview_embed" : "/api/embed";

export const ActivityApi = {
  recent_views: GET("/api/activity/recent_views"),
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
  billingInfo: GET("/api/ee/billing"),
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

  const getDatasetQueryResult = datasetQuery => {
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
  list: GET("/api/card", (cards, { data }) =>
    // HACK: support for the "q" query param until backend implements it
    cards.filter(
      card =>
        !data.q || card.name.toLowerCase().indexOf(data.q.toLowerCase()) >= 0,
    ),
  ),
  create: POST("/api/card"),
  uploadCSV: POST("/api/card/from-csv", {
    formData: true,
    fetch: true,
  }),
  get: GET("/api/card/:cardId"),
  update: PUT("/api/card/:id"),
  delete: DELETE("/api/card/:id"),
  persist: POST("/api/card/:id/persist"),
  unpersist: POST("/api/card/:id/unpersist"),
  refreshModelCache: POST("/api/card/:id/refresh"),
  query: POST("/api/card/:cardId/query"),
  query_pivot: POST("/api/card/pivot/:cardId/query"),
  bookmark: {
    create: POST("/api/card/:id/bookmark"),
    delete: DELETE("/api/card/:id/bookmark"),
  },
  listPublic: GET("/api/card/public"),
  listEmbeddable: GET("/api/card/embeddable"),
  createPublicLink: POST("/api/card/:id/public_link"),
  deletePublicLink: DELETE("/api/card/:id/public_link"),
  // related
  related: GET("/api/card/:cardId/related"),
  adHocRelated: POST("/api/card/related"),
  compatibleCards: GET("/api/card/:cardId/series"),
  parameterValues: GET("/api/card/:cardId/params/:paramId/values"),
  parameterSearch: GET("/api/card/:cardId/params/:paramId/search/:query"),
};

export const ModelIndexApi = {
  list: GET("/api/model-index"),
  get: GET("/api/model-index/:id"),
  create: POST("/api/model-index"),
  update: PUT("/api/model-index/:id"),
  delete: DELETE("/api/model-index/:id"),
};

export const DashboardApi = {
  // creates a new empty dashboard
  create: POST("/api/dashboard"),
  // saves a complete transient dashboard
  save: POST("/api/dashboard/save"),
  get: GET("/api/dashboard/:dashId"),
  update: PUT("/api/dashboard/:id"),
  delete: DELETE("/api/dashboard/:dashId"),
  parameterValues: GET("/api/dashboard/:dashId/params/:paramId/values"),
  parameterSearch: GET("/api/dashboard/:dashId/params/:paramId/search/:query"),
  validFilterFields: GET("/api/dashboard/params/valid-filter-fields"),

  listPublic: GET("/api/dashboard/public"),
  listEmbeddable: GET("/api/dashboard/embeddable"),
  createPublicLink: POST("/api/dashboard/:id/public_link"),
  deletePublicLink: DELETE("/api/dashboard/:id/public_link"),

  cardQuery: POST(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query",
  ),
  cardQueryPivot: POST(
    "/api/dashboard/pivot/:dashboardId/dashcard/:dashcardId/card/:cardId/query",
  ),
};

export const CollectionsApi = {
  list: GET("/api/collection"),
  create: POST("/api/collection"),
  get: GET("/api/collection/:id"),
  // Temporary route for getting things not in a collection
  getRoot: GET("/api/collection/root"),
  update: PUT("/api/collection/:id"),
  graph: GET("/api/collection/graph"),
  updateGraph: PUT("/api/collection/graph"),
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

export const TimelineApi = {
  list: GET("/api/timeline"),
  listForCollection: GET("/api/collection/:collectionId/timelines"),
  get: GET("/api/timeline/:id"),
  create: POST("/api/timeline"),
  update: PUT("/api/timeline/:id"),
};

export const TimelineEventApi = {
  list: GET("/api/timeline-event"),
  get: GET("/api/timeline-event/:id"),
  create: POST("/api/timeline-event"),
  update: PUT("/api/timeline-event/:id"),
};

export const MetabaseApi = {
  db_add_sample_database: POST("/api/database/sample_database"),
  db_autocomplete_suggestions: GET(
    "/api/database/:dbId/autocomplete_suggestions?:matchStyle=:query",
  ),
  db_card_autocomplete_suggestions: GET(
    "/api/database/:dbId/card_autocomplete_suggestions",
  ),
  db_sync_schema: POST("/api/database/:dbId/sync_schema"),
  db_dismiss_sync_spinner: POST("/api/database/:dbId/dismiss_spinner"),
  db_persist: POST("/api/database/:dbId/persist"),
  db_unpersist: POST("/api/database/:dbId/unpersist"),
  db_usage_info: GET("/api/database/:dbId/usage_info"),
  table_list: GET("/api/table"),
  table_get: GET("/api/table/:tableId"),
  table_update: PUT("/api/table/:id"),
  // table_fields:                GET("/api/table/:tableId/fields"),
  table_fks: GET("/api/table/:tableId/fks"),
  // table_reorder_fields:       POST("/api/table/:tableId/reorder"),
  tableAppendCSV: POST("/api/table/:tableId/append-csv", {
    formData: true,
    fetch: true,
  }),
  tableReplaceCSV: POST("/api/table/:tableId/replace-csv", {
    formData: true,
    fetch: true,
  }),
  field_get: GET("/api/field/:fieldId"),
  // field_summary:               GET("/api/field/:fieldId/summary"),
  field_values: GET("/api/field/:fieldId/values"),
  field_values_update: POST("/api/field/:fieldId/values"),
  field_search: GET("/api/field/:fieldId/search/:searchFieldId"),
  field_remapping: GET("/api/field/:fieldId/remapping/:remappedFieldId"),
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

export const SegmentApi = {
  list: GET("/api/segment"),
  create: POST("/api/segment"),
  get: GET("/api/segment/:segmentId"),
  update: PUT("/api/segment/:id"),
  delete: DELETE("/api/segment/:segmentId"),
};

export const MetricApi = {
  list: GET("/api/legacy-metric"),
  create: POST("/api/legacy-metric"),
  get: GET("/api/legacy-metric/:metricId"),
  update: PUT("/api/legacy-metric/:id"),
  delete: DELETE("/api/legacy-metric/:metricId"),
};

export const RevisionApi = {
  list: GET("/api/revision"),
  revert: POST("/api/revision/revert"),
};

export const RevisionsApi = {
  get: GET("/api/:entity/:id/revisions"),
};

export const SessionApi = {
  create: POST("/api/session"),
  createWithGoogleAuth: POST("/api/session/google_auth"),
  delete: DELETE("/api/session"),
  slo: POST("/auth/sso/logout"),
  properties: GET("/api/session/properties"),
  forgot_password: POST("/api/session/forgot_password"),
  reset_password: POST("/api/session/reset_password"),
  unsubscribe: POST("/api/session/pulse/unsubscribe"),
  undo_unsubscribe: POST("/api/session/pulse/unsubscribe/undo"),
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
  get: GET("/api/persist/:id"),
  getForModel: GET("/api/persist/card/:id"),
  enablePersistence: POST("/api/persist/enable"),
  disablePersistence: POST("/api/persist/disable"),
  setRefreshSchedule: POST("/api/persist/set-refresh-schedule"),
};

export const SetupApi = {
  create: POST("/api/setup"),
  admin_checklist: GET("/api/setup/admin_checklist"),
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

export const I18NApi = {
  locale: GET("/app/locales/:locale.json"),
};

export function setPublicQuestionEndpoints(uuid) {
  setCardEndpoints("/api/public/card/:uuid", { uuid });
}

export function setPublicDashboardEndpoints(uuid) {
  setDashboardEndpoints("/api/public/dashboard/:uuid", { uuid });
}

export function setEmbedQuestionEndpoints(token) {
  if (!IS_EMBED_PREVIEW) {
    setCardEndpoints("/api/embed/card/:token", { token });
  }
}

export function setEmbedDashboardEndpoints(token) {
  if (!IS_EMBED_PREVIEW) {
    setDashboardEndpoints("/api/embed/dashboard/:token", { token });
  } else {
    setDashboardParameterValuesEndpoint(embedBase);
  }
}

function GET_with(url, params, omitKeys) {
  return (data, options) =>
    GET(url)({ ...params, ..._.omit(data, omitKeys) }, options);
}

function setCardEndpoints(prefix, params) {
  CardApi.parameterValues = GET_with(
    `${prefix}/params/:paramId/values`,
    params,
    ["cardId"],
  );
  CardApi.parameterSearch = GET_with(
    `${prefix}/params/:paramId/search/:query`,
    params,
    ["cardId"],
  );
  MetabaseApi.field_values = GET_with(
    `${prefix}/field/:fieldId/values`,
    params,
  );
  MetabaseApi.field_search = GET_with(
    `${prefix}/field/:fieldId/search/:searchFieldId`,
    params,
  );
  MetabaseApi.field_remapping = GET_with(
    `${prefix}/field/:fieldId/remapping/:remappedFieldId`,
    params,
  );
}

function setDashboardEndpoints(prefix, params) {
  DashboardApi.parameterValues = GET_with(
    `${prefix}/params/:paramId/values`,
    params,
    ["dashId"],
  );
  DashboardApi.parameterSearch = GET_with(
    `${prefix}/params/:paramId/search/:query`,
    params,
    ["dashId"],
  );
  MetabaseApi.field_values = GET_with(
    `${prefix}/field/:fieldId/values`,
    params,
  );
  MetabaseApi.field_search = GET_with(
    `${prefix}/dashboard/:dashId/field/:fieldId/search/:searchFieldId`,
    params,
  );
  MetabaseApi.field_remapping = GET_with(
    `${prefix}/field/:fieldId/remapping/:remappedFieldId`,
    params,
  );
}

function setDashboardParameterValuesEndpoint(prefix) {
  DashboardApi.parameterValues = GET(
    `${prefix}/dashboard/:dashId/params/:paramId/values`,
  );
}

export const ActionsApi = {
  list: GET("/api/action"),
  get: GET("/api/action/:id"),
  create: POST("/api/action"),
  update: PUT("/api/action/:id"),
  execute: POST("/api/action/:id/execute"),
  prefetchValues: GET("/api/action/:id/execute"),
  prefetchDashcardValues: GET(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/execute",
  ),
  executeDashcardAction: POST(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/execute",
  ),
  createPublicLink: POST("/api/action/:id/public_link"),
  deletePublicLink: DELETE("/api/action/:id/public_link"),
  listPublic: GET("/api/action/public"),
};

export const MetabotApi = {
  modelPrompt: POST("/api/metabot/model/:modelId"),
  databasePrompt: POST("/api/metabot/database/:databaseId"),
  databasePromptQuery: POST("/api/metabot/database/:databaseId/query"),
  sendFeedback: POST("/api/metabot/feedback"),
};

export const CacheConfigApi = {
  list: GET("/api/cache"),
  update: PUT("/api/cache"),
  delete: DELETE("/api/cache"),
  invalidate: POST("/api/cache/invalidate"),
};
