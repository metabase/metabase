import fetchMock from "fetch-mock";

export function setupSlackManifestEndpoint() {
  fetchMock.get("path:/api/slack/manifest", "manifest-content");
}

export function setupSlackSettingsEndpoint() {
  fetchMock.put("path:/api/slack/settings", { status: 204 });
}
