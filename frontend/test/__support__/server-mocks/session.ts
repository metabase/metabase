import fetchMock from "fetch-mock";

import type { PasswordResetTokenStatus, Settings } from "metabase-types/api";

export function setupPropertiesEndpoints(settings: Settings) {
  fetchMock.get("path:/api/session/properties", settings);
}

export function setupLoginEndpoint() {
  fetchMock.post("path:/api/session", 204);
}

export function setupLogoutEndpoint() {
  fetchMock.delete("path:/api/session", 204);
}

export function setupForgotPasswordEndpoint() {
  fetchMock.post("path:/api/session/forgot_password", 204);
}

export function setupResetPasswordEndpoint() {
  fetchMock.post("path:/api/session/reset_password", 204);
}

export function setupPasswordResetTokenEndpoint(
  status: PasswordResetTokenStatus,
) {
  fetchMock.get("path:/api/session/password_reset_token_valid", status);
}
