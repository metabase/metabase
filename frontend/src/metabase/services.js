import { DELETE, GET, POST, PUT } from "metabase/api/legacy-client";

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
