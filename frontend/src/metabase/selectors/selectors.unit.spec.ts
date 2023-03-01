import { createMockTokenFeatures } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { getUpgradeUrl } from "./settings";

describe("getUpgradeUrl", () => {
  it.each([
    { hosting: false, sso: false, path: "utm_source=oss" },
    { hosting: true, sso: false, path: "utm_source=starter" },
    { hosting: false, sso: true, path: "utm_source=pro-self-hosted" },
    { hosting: true, sso: true, path: "utm_source=pro-cloud" },
  ])("should set utm_source", ({ hosting, sso, path }) => {
    const state = createMockState({
      settings: createMockSettingsState({
        "token-features": createMockTokenFeatures({ hosting, sso }),
      }),
    });

    expect(getUpgradeUrl(state, { utm_media: "license" })).toContain(path);
  });
});
