import fetchMock from "fetch-mock";

import type { SlackAppInfo } from "metabase-types/api";
import { createMockSlackAppInfo } from "metabase-types/api/mocks";

export function setupSlackManifestEndpoint() {
  fetchMock.get("path:/api/slack/manifest", "manifest-content");
}

export function setupSlackSettingsEndpoint({
  isTokenInvalid = false,
}: { isTokenInvalid?: boolean } = {}) {
  fetchMock.put(
    "path:/api/slack/settings",
    isTokenInvalid
      ? {
          status: 400,
          body: {
            message: "Invalid Slack token.",
            errors: { "slack-app-token": "invalid token" },
          },
        }
      : { status: 204 },
  );
}

export function setupSlackAppInfoEndpoint(appInfo?: Partial<SlackAppInfo>) {
  fetchMock.get("path:/api/slack/app-info", createMockSlackAppInfo(appInfo));
}
