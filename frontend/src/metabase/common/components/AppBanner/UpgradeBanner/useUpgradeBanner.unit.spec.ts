import { findRequests, setupSettingEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import * as iframeUtils from "metabase/utils/iframe";
import {
  createMockUser,
  createMockVersion,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { useUpgradeBanner } from "./useUpgradeBanner";

const CURRENT_VERSION = "v0.63.5";
const ALERT_MESSAGE = "Please upgrade to v0.63.10";

const MATCHING_VERSION_INFO = createMockVersionInfo({
  alert_upgrade_versions: [
    {
      min: "v0.63.0",
      fixed: "v0.63.10",
      message: ALERT_MESSAGE,
    },
  ],
});

function setup({
  isAdmin = true,
  isHosted = false,
  isEmbedded = false,
}: {
  isAdmin?: boolean;
  isHosted?: boolean;
  isEmbedded?: boolean;
} = {}) {
  jest.spyOn(iframeUtils, "isWithinIframe").mockReturnValue(isEmbedded);

  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: MATCHING_VERSION_INFO,
  });

  return renderHookWithProviders(() => useUpgradeBanner(), {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: mockSettings({
        "is-hosted?": isHosted,
        version: createMockVersion({ tag: CURRENT_VERSION }),
      }),
    }),
  });
}

async function waitForVersionInfoRequest() {
  await waitFor(async () => {
    const requests = await findRequests("GET");
    expect(
      requests.some((request) =>
        request.url.includes("/api/setting/version-info"),
      ),
    ).toBe(true);
  });
}

describe("useUpgradeBanner", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the alert message for an admin on a self-hosted instance", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current).toEqual({ message: ALERT_MESSAGE });
    });
  });

  it("returns null for non-admins", () => {
    const { result } = setup({ isAdmin: false });

    expect(result.current).toBeNull();
  });

  it("returns null on hosted instances", async () => {
    const { result } = setup({ isHosted: true });

    await waitForVersionInfoRequest();
    expect(result.current).toBeNull();
  });

  it("returns null when embedded in an iframe", async () => {
    const { result } = setup({ isEmbedded: true });

    await waitForVersionInfoRequest();
    expect(result.current).toBeNull();
  });
});
