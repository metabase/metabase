import {
  createMockTokenFeatures,
  createMockTokenStatus,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { getIsPaidPlan, getUpgradeUrl } from "./settings";

describe("getUpgradeUrl", () => {
  it.each([
    {
      media: "license",
      users: 1,
      features: { hosting: false, sso_jwt: false },
      params: "?utm_media=license&utm_source=oss&utm_users=1",
    },
    {
      media: "permissions_top",
      users: 2,
      features: { hosting: true, sso_jwt: false },
      params: "?utm_media=permissions_top&utm_source=starter&utm_users=2",
    },
    {
      media: "license",
      users: 3,
      features: { hosting: false, sso_jwt: true },
      params: "?utm_media=license&utm_source=pro-self-hosted&utm_users=3",
    },
    {
      media: "license",
      users: undefined,
      features: { hosting: true, sso_jwt: true },
      params: "?utm_media=license&utm_source=pro-cloud",
    },
  ])("should set utm_source", ({ media, features, users, params }) => {
    const state = createMockState({
      settings: createMockSettingsState({
        "token-features": createMockTokenFeatures(features),
        "active-users-count": users,
      }),
    });

    const url = new URL(getUpgradeUrl(state, { utm_media: media }));
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
