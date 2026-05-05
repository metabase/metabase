import fetchMock from "fetch-mock";

import type { SlackAppInfo } from "metabase-types/api";
import { createMockSlackAppInfo } from "metabase-types/api/mocks";

export function setupSlackManifestEndpoint() {
  fetchMock.get("path:/api/slack/manifest", "manifest-content");
}

export function setupSlackSettingsEndpoint() {
  fetchMock.put("path:/api/slack/settings", { status: 204 });
}

export function setupSlackAppInfoEndpoint(appInfo?: Partial<SlackAppInfo>) {
  fetchMock.get("path:/api/slack/app-info", createMockSlackAppInfo(appInfo));
}
