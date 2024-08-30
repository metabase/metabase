import {
  createMockTokenFeatures,
  createMockTokenStatus,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { getDocsUrl, getIsPaidPlan, getUpgradeUrl } from "./settings";

describe("getUpgradeUrl", () => {
  it.each([
    {
      content: "license",
      users: 1,
      features: { hosting: false, sso_jwt: false },
      params:
        "?utm_source=product&utm_medium=upsell&utm_content=license&source_plan=oss&utm_users=1",
    },
    {
      content: "permissions_top",
      users: 2,
      features: { hosting: true, sso_jwt: false },
      params:
        "?utm_source=product&utm_medium=upsell&utm_content=permissions_top&source_plan=starter&utm_users=2",
    },
    {
      content: "license",
      users: 3,
      features: { hosting: false, sso_jwt: true },
      params:
        "?utm_source=product&utm_medium=upsell&utm_content=license&source_plan=pro-self-hosted&utm_users=3",
    },
    {
      content: "license",
      users: undefined,
      features: { hosting: true, sso_jwt: true },
      params:
        "?utm_source=product&utm_medium=upsell&utm_content=license&source_plan=pro-cloud",
    },
  ])("should set utm_source", ({ content, features, users, params }) => {
    const state = createMockState({
      settings: createMockSettingsState({
        "token-features": createMockTokenFeatures(features),
        "active-users-count": users,
      }),
    });

    const url = new URL(getUpgradeUrl(state, { utm_content: content }));
    expect(url.search).toEqual(params);
  });
});

describe("getIsPaidPlan", () => {
  it("should return false if there is no token", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "token-status": null,
      }),
    });

    expect(getIsPaidPlan(state)).toEqual(false);
  });

  it("should return false if there is an invalid token", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "token-status": createMockTokenStatus({ valid: false }),
      }),
    });

    expect(getIsPaidPlan(state)).toEqual(false);
  });

  it("should return true if there is a valid token", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "token-status": createMockTokenStatus({ valid: true }),
      }),
    });

    expect(getIsPaidPlan(state)).toEqual(true);
  });
});

// function withTempSetting(settingName, settingValue, thunk) {
//   const origVal = MetabaseSettings.get(settingName);
//   MetabaseSettings.set(settingName, settingValue);
//   try {
//     thunk();
//   } finally {
//     MetabaseSettings.set(settingName, origVal);
//   }
// }

describe("getDocsUrl", () => {
  // all of these should point to the same doc URL
  [
    ["v0.41.0", "v0.41"],
    [undefined, "latest"],
    ["v0.41.1-SNAPSHOT", "latest"],
    ["v0.41.2-rc1", "v0.41"],
    ["v0.41.3-RC2", "v0.41"],
    ["v1.41.4", "v0.41"],
    ["v1.41.3-snapshot", "latest"],
    ["v1.41.2-rc1", "v0.41"],
    ["v1.41.1-RANDOM-SUFFIX", "v0.41"],
  ].forEach(v => {
    it("handles version " + v[0] + " by pointing it to " + v[1], () => {
      const state = createMockState({
        settings: createMockSettingsState({
          version: { tag: v[0] },
        }),
      });

      expect(getDocsUrl(state, { page: "foo/bar" })).toBe(
        "https://www.metabase.com/docs/" + v[1] + "/foo/bar.html",
      );
    });
  });

  it("handles anchor", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        version: { tag: "v0.41.0" },
      }),
    });

    expect(getDocsUrl(state, { page: "foo/bar", anchor: "baz" })).toBe(
      "https://www.metabase.com/docs/v0.41/foo/bar.html#baz",
    );
  });
});
