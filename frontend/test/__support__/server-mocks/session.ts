import fetchMock from "fetch-mock";
import { Settings } from "metabase-types/api";

export function setupPropertiesEndpoints(settings: Settings) {
  fetchMock.get("path:/api/session/properties", settings);
}

export function setupLogoutEndpoints() {
  fetchMock.delete("path:/api/session", 204);
}

export function setupForgotPasswordEndpoints() {
  fetchMock.post("path:/api/session/forgot_password", 204);
}
