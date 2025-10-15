import fetchMock from "fetch-mock";

import type {
  EnterpriseSettings,
  PasswordResetTokenStatus,
  Settings,
} from "metabase-types/api";

export function setupPropertiesEndpoints(
  settings: Settings | EnterpriseSettings,
) {
  fetchMock.removeRoute("get-session-properties");
  fetchMock.get("path:/api/session/properties", settings, {
    name: "get-session-properties",
  });
}

export function setupLoginEndpoint() {
  fetchMock.post("path:/api/session", 204, { name: "session-login" });
}

export function setupLogoutEndpoint() {
  fetchMock.delete("path:/api/session", 204, { name: "session-logout" });
}

export function setupForgotPasswordEndpoint() {
  fetchMock.post("path:/api/session/forgot_password", 204, {
    name: "session-forgot-password",
  });
}

export function setupResetPasswordEndpoint() {
  fetchMock.post("path:/api/session/reset_password", 204, {
    name: "session-reset-password",
  });
}

export function setupPasswordResetTokenEndpoint(
  status: PasswordResetTokenStatus,
) {
  fetchMock.get("path:/api/session/password_reset_token_valid", status, {
    name: "session-password-reset-token",
  });
}
