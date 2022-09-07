import _ from "underscore";

import { GET, PUT, POST, DELETE } from "metabase/lib/api";
import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import Question from "metabase-lib/lib/Question";
import { FieldDimension } from "metabase-lib/lib/Dimension";

// use different endpoints for embed previews
const embedBase = IS_EMBED_PREVIEW ? "/api/preview_embed" : "/api/embed";

import getGAMetadata from "promise-loader?global!metabase/lib/ga-metadata"; // eslint-disable-line import/default

export const ActivityApi = {
  list: GET("/api/activity"),
  recent_views: GET("/api/activity/recent_views"),
};

export const BookmarkApi = {
  card: {
    create: POST("/api/bookmark/card/:id"),
    delete: DELETE("/api/bookmark/card/:id"),
  },
  collection: {
    create: POST("/api/bookmark/collection/:id"),
    delete: DELETE("/api/bookmark/collection/:id"),
  },
  dashboard: {
    create: POST("/api/bookmark/dashboard/:id"),
    delete: DELETE("/api/bookmark/dashboard/:id"),
  },
  reorder: PUT("/api/bookmark/ordering"),
};

// only available with token loaded
export const GTAPApi = {
  list: GET("/api/mt/gtap"),
  create: POST("/api/mt/gtap"),
  update: PUT("/api/mt/gtap/:id"),
  attributes: GET("/api/mt/user/attributes"),
};

export const StoreApi = {
  tokenStatus: GET("/api/premium-features/token/status"),
};

// Pivot tables need extra data beyond what's described in the MBQL query itself.
// To fetch that extra data we rely on specific APIs for pivot tables that mirrow the normal endpoints.
// Those endpoints take the query along with `pivot_rows` and `pivot_cols` to return the subtotal data.
// If we add breakout/grouping sets to MBQL in the future we can remove this API switching.
export function maybeUsePivotEndpoint(api, card, metadata) {
  function canonicalFieldRef(ref) {
    // Field refs between the query and setting might differ slightly.
    // This function trims binned dimensions to just the field-id
    const dimension = FieldDimension.parseMBQL(ref);
    if (!dimension) {
      return ref;
    }
    return dimension.withoutOptions("binning").mbql();
  }

  const question = new Question(card, metadata);

  function wrap(api) {
    return (params, ...rest) => {
      const setting = question.setting("pivot_table.column_split");
      const breakout =
        (question.isStructured() && question.query().breakouts()) || [];
      const { rows: pivot_rows, columns: pivot_cols } = _.mapObject(
        setting,
        fieldRefs =>
          fieldRefs
            .map(field_ref =>
              breakout.findIndex(b =>
                _.isEqual(canonicalFieldRef(b), canonicalFieldRef(field_ref)),
              ),
            )
            .filter(index => index !== -1),
      );
      return api({ ...params, pivot_rows, pivot_cols }, ...rest);
    };
  }
  if (
    card.display !== "pivot" ||
    !question.isStructured() ||
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

export const CardApi = {
  list: GET("/api/card", (cards, { data }) =>
    // HACK: support for the "q" query param until backend implements it
    cards.filter(
      card =>
        !data.q || card.name.toLowerCase().indexOf(data.q.toLowerCase()) >= 0,
    ),
  ),
  create: POST("/api/card"),
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
};

export const DashboardApi = {
  list: GET("/api/dashboard"),
  // creates a new empty dashboard
  create: POST("/api/dashboard"),
  // saves a complete transient dashboard
  save: POST("/api/dashboard/save"),
  get: GET("/api/dashboard/:dashId"),
  update: PUT("/api/dashboard/:id"),
  delete: DELETE("/api/dashboard/:dashId"),
  addcard: POST("/api/dashboard/:dashId/cards"),
  removecard: DELETE("/api/dashboard/:dashId/cards"),
  reposition_cards: PUT("/api/dashboard/:dashId/cards"),
  favorite: POST("/api/dashboard/:dashId/favorite"),
  unfavorite: DELETE("/api/dashboard/:dashId/favorite"),
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
  exportCardQuery: POST(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/card/:cardId/query/:exportFormat",
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

export const DataAppsApi = {
  list: GET("/api/app"),
  create: POST("/api/app"),
  update: PUT("/api/app/:id"),
};

const PIVOT_PUBLIC_PREFIX = "/api/public/pivot/";

export const PublicApi = {
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
  db_candidates: GET("/api/automagic-dashboards/database/:id/candidates"),
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
  db_list: GET("/api/database", res => res["data"]),
  db_create: POST("/api/database"),
  db_validate: POST("/api/database/validate"),
  db_add_sample_database: POST("/api/database/sample_database"),
  db_get: GET("/api/database/:dbId"),
  db_update: PUT("/api/database/:id"),
  db_delete: DELETE("/api/database/:dbId"),
  db_metadata: GET("/api/database/:dbId/metadata"),
  db_schemas: GET("/api/database/:dbId/schemas"),
  db_schema_tables: GET("/api/database/:dbId/schema/:schemaName"),
  //db_tables:   GET("/api/database/:dbId/tables"),
  db_fields: GET("/api/database/:dbId/fields"),
  db_idfields: GET("/api/database/:dbId/idfields"),
  db_autocomplete_suggestions: GET(
    "/api/database/:dbId/autocomplete_suggestions?:matchStyle=:query",
  ),
  db_sync_schema: POST("/api/database/:dbId/sync_schema"),
  db_dismiss_sync_spinner: POST("/api/database/:dbId/dismiss_spinner"),
  db_rescan_values: POST("/api/database/:dbId/rescan_values"),
  db_discard_values: POST("/api/database/:dbId/discard_values"),
  db_persist: POST("/api/database/:dbId/persist"),
  db_unpersist: POST("/api/database/:dbId/unpersist"),
  db_get_db_ids_with_deprecated_drivers: GET("/db-ids-with-deprecated-drivers"),
  table_list: GET("/api/table"),
  // table_get:                   GET("/api/table/:tableId"),
  table_update: PUT("/api/table/:id"),
  // table_fields:                GET("/api/table/:tableId/fields"),
  table_fks: GET("/api/table/:tableId/fks"),
  // table_reorder_fields:       POST("/api/table/:tableId/reorder"),
  table_query_metadata: GET(
    "/api/table/:tableId/query_metadata",
    async table => {
      // HACK: inject GA metadata that we don't have intergrated on the backend yet
      if (table && table.db && table.db.engine === "googleanalytics") {
        const GA = await getGAMetadata();
        table.fields = table.fields.map(field => ({
          ...field,
          ...GA.fields[field.name],
        }));
        table.metrics.push(
          ...GA.metrics.map(metric => ({
            ...metric,
            table_id: table.id,
            googleAnalyics: true,
          })),
        );
        table.segments.push(
          ...GA.segments.map(segment => ({
            ...segment,
            table_id: table.id,
            googleAnalyics: true,
          })),
        );
      }

      if (table && table.fields) {
        // replace dimension_options IDs with objects
        for (const field of table.fields) {
          if (field.dimension_options) {
            field.dimension_options = field.dimension_options.map(
              id => table.dimension_options[id],
            );
          }
          if (field.default_dimension_option) {
            field.default_dimension_option =
              table.dimension_options[field.default_dimension_option];
          }
        }
      }

      return table;
    },
  ),
  // table_sync_metadata:        POST("/api/table/:tableId/sync"),
  table_rescan_values: POST("/api/table/:tableId/rescan_values"),
  table_discard_values: POST("/api/table/:tableId/discard_values"),
  field_get: GET("/api/field/:fieldId"),
  // field_summary:               GET("/api/field/:fieldId/summary"),
  field_values: GET("/api/field/:fieldId/values"),
  field_values_update: POST("/api/field/:fieldId/values"),
  field_update: PUT("/api/field/:id"),
  field_dimension_update: POST("/api/field/:fieldId/dimension"),
  field_dimension_delete: DELETE("/api/field/:fieldId/dimension"),
  field_rescan_values: POST("/api/field/:fieldId/rescan_values"),
  field_discard_values: POST("/api/field/:fieldId/discard_values"),
  field_search: GET("/api/field/:fieldId/search/:searchFieldId"),
  field_remapping: GET("/api/field/:fieldId/remapping/:remappedFieldId"),
  dataset: POST("/api/dataset"),
  dataset_pivot: POST("/api/dataset/pivot"),
  dataset_duration: POST("/api/dataset/duration"),
  native: POST("/api/dataset/native"),

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

export const AlertApi = {
  list: GET("/api/alert"),
  list_for_question: GET("/api/alert/question/:questionId"),
  get: GET("/api/alert/:id"),
  create: POST("/api/alert"),
  update: PUT("/api/alert/:id"),
  unsubscribe: DELETE("/api/alert/:id/subscription"),
};

export const SegmentApi = {
  list: GET("/api/segment"),
  create: POST("/api/segment"),
  get: GET("/api/segment/:segmentId"),
  update: PUT("/api/segment/:id"),
  delete: DELETE("/api/segment/:segmentId"),
};

export const MetricApi = {
  list: GET("/api/metric"),
  create: POST("/api/metric"),
  get: GET("/api/metric/:metricId"),
  update: PUT("/api/metric/:id"),
  delete: DELETE("/api/metric/:metricId"),
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
  properties: GET("/api/session/properties"),
  forgot_password: POST("/api/session/forgot_password"),
  reset_password: POST("/api/session/reset_password"),
  password_reset_token_valid: GET("/api/session/password_reset_token_valid"),
};

export const SettingsApi = {
  list: GET("/api/setting"),
  put: PUT("/api/setting/:key"),
  putAll: PUT("/api/setting"),
  // setAll:                      PUT("/api/setting"),
  // delete:                   DELETE("/api/setting/:key"),
};

export const PermissionsApi = {
  groups: GET("/api/permissions/group"),
  groupDetails: GET("/api/permissions/group/:id"),
  graph: GET("/api/permissions/graph"),
  updateGraph: PUT("/api/permissions/graph"),
  createGroup: POST("/api/permissions/group"),
  memberships: GET("/api/permissions/membership"),
  createMembership: POST("/api/permissions/membership"),
  deleteMembership: DELETE("/api/permissions/membership/:id"),
  updateMembership: PUT("/api/permissions/membership/:id"),
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
  validate_db: POST("/api/setup/validate"),
  admin_checklist: GET("/api/setup/admin_checklist"),
  user_defaults: GET("/api/setup/user_defaults"),
};

export const UserApi = {
  create: POST("/api/user"),
  list: GET("/api/user"),
  current: GET("/api/user/current"),
  // get:                         GET("/api/user/:userId"),
  update: PUT("/api/user/:id"),
  update_password: PUT("/api/user/:id/password"),
  update_qbnewb: PUT("/api/user/:id/modal/qbnewb"),
  delete: DELETE("/api/user/:userId"),
  reactivate: PUT("/api/user/:userId/reactivate"),
  send_invite: POST("/api/user/:id/send_invite"),
};

export const UtilApi = {
  password_check: POST("/api/util/password_check"),
  random_token: GET("/api/util/random_token"),
  logs: GET("/api/util/logs"),
  bug_report_details: GET("/api/util/bug_report_details"),
  // this one does not need an HTTP verb because it's opened as an external link
  connection_pool_details_url: "/api/util/diagnostic_info/connection_pool_info",
};

export const GeoJSONApi = {
  load: GET("/api/geojson"),
  get: GET("/api/geojson/:id"),
};

export const I18NApi = {
  locale: GET("/app/locales/:locale.json"),
};

export const TaskApi = {
  get: GET("/api/task"),
  getJobsInfo: GET("/api/task/info"),
};

export function setPublicQuestionEndpoints(uuid) {
  setFieldEndpoints("/api/public/card/:uuid", { uuid });
}
export function setPublicDashboardEndpoints() {
  setParamsEndpoints("/api/public");
}
export function setEmbedQuestionEndpoints(token) {
  if (!IS_EMBED_PREVIEW) {
    setFieldEndpoints("/api/embed/card/:token", { token });
  }
}
export function setEmbedDashboardEndpoints() {
  if (!IS_EMBED_PREVIEW) {
    setParamsEndpoints("/api/embed");
  }
}

function GET_with(url, params) {
  return (data, options) => GET(url)({ ...params, ...data }, options);
}

function setFieldEndpoints(prefix, params) {
  MetabaseApi.field_values = GET_with(
    prefix + "/field/:fieldId/values",
    params,
  );
  MetabaseApi.field_search = GET_with(
    prefix + "/field/:fieldId/search/:searchFieldId",
    params,
  );
  MetabaseApi.field_remapping = GET_with(
    prefix + "/field/:fieldId/remapping/:remappedFieldId",
    params,
  );
}

function setParamsEndpoints(prefix) {
  DashboardApi.parameterValues = GET(
    prefix + "/dashboard/:dashId/params/:paramId/values",
  );
  DashboardApi.parameterSearch = GET(
    prefix + "/dashboard/:dashId/params/:paramId/search/:query",
  );
}

export const ActionsApi = {
  create: POST("/api/action/row/create"),
  update: POST("/api/action/row/update"),
  delete: POST("/api/action/row/delete"),
  bulkUpdate: POST("/api/action/bulk/update/:tableId"),
  bulkDelete: POST("/api/action/bulk/delete/:tableId"),
  execute: POST(
    "/api/dashboard/:dashboardId/dashcard/:dashcardId/action/:actionId/execute",
  ),
};
