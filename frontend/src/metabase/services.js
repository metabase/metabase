import { DELETE, GET, POST, PUT } from "metabase/api/legacy-client";

// only available with token loaded
export const GTAPApi = {
  list: GET("/api/mt/gtap"),
  attributes: GET("/api/mt/user/attributes"),
  validate: POST("/api/mt/gtap/validate"),
};

export const CollectionsApi = {
  get: GET("/api/collection/:id"),
  graph: GET("/api/collection/graph"),
  updateGraph: PUT("/api/collection/graph?skip-graph=true"),
};

export const PublicApi = {
  action: GET(`/api/public/action/:uuid`),
  executeDashcardAction: POST(
    `/api/public/dashboard/:dashboardId/dashcard/:dashcardId/execute`,
  ),
  executeAction: POST(`/api/public/action/:uuid/execute`),
  card: GET(`/api/public/card/:uuid`),
  dashboard: GET(`/api/public/dashboard/:uuid`),
  prefetchDashcardValues: GET(
    `/api/public/dashboard/:dashboardId/dashcard/:dashcardId/execute`,
  ),
  document: GET(`/api/public/document/:uuid`),
};

// `/api/embed` is rewritten to `/api/preview_embed` by the request middleware
// when running inside an embed preview.
export const EmbedApi = {
  card: GET("/api/embed/card/:token"),
  dashboard: GET("/api/embed/dashboard/:token"),
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
