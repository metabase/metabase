import { DELETE, GET, POST, PUT } from "metabase/api/legacy-client";
import { isEmbedPreview } from "metabase/embedding/config";

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

export const DashboardApi = {
  get: GET("/api/dashboard/:dashId"),
  parameterValues: GET("/api/dashboard/:dashId/params/:paramId/values"),
  parameterSearch: GET("/api/dashboard/:dashId/params/:paramId/search/:query"),
  validFilterFields: GET("/api/dashboard/params/valid-filter-fields"),
};

export const CollectionsApi = {
  get: GET("/api/collection/:id"),
  graph: GET("/api/collection/graph"),
  updateGraph: PUT("/api/collection/graph?skip-graph=true"),
};

export const PublicApi = {
  action: GET(`${publicBase}/action/:uuid`),
  executeDashcardAction: POST(
    `${publicBase}/dashboard/:dashboardId/dashcard/:dashcardId/execute`,
  ),
  executeAction: POST(`${publicBase}/action/:uuid/execute`),
  card: GET(`${publicBase}/card/:uuid`),
  dashboard: GET(`${publicBase}/dashboard/:uuid`),
  prefetchDashcardValues: GET(
    `${publicBase}/dashboard/:dashboardId/dashcard/:dashcardId/execute`,
  ),
  document: GET(`/api/public/document/:uuid`),
};

export const EmbedApi = {
  card: GET(getEmbedBase() + "/card/:token"),
  dashboard: GET(getEmbedBase() + "/dashboard/:token"),
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
