import { createMockTokenFeatures } from "metabase-types/api/mocks";
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
      features: { hosting: false, sso: false },
      params: "?utm_media=license&utm_source=oss&utm_users=1",
    },
    {
      media: "permissions_top",
      users: 2,
      features: { hosting: true, sso: false },
      params: "?utm_media=permissions_top&utm_source=starter&utm_users=2",
    },
    {
      media: "license",
      users: 3,
      features: { hosting: false, sso: true },
      params: "?utm_media=license&utm_source=pro-self-hosted&utm_users=3",
    },
    {
      media: "license",
      users: undefined,
      features: { hosting: true, sso: true },
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
  it.each([
    {
      features: { hosting: false, sso: false },
      isPaidPlan: false,
    },
    {
      features: { hosting: true, sso: false },
      isPaidPlan: true,
    },
    {
      features: { hosting: false, sso: true },
      isPaidPlan: true,
    },
    {
      features: { hosting: true, sso: true },
      isPaidPlan: true,
    },
  ])(
    "should return `$isPaidPlan` if token features have hosting: $features.hosting, and sso: $features.sso",
    ({ features, isPaidPlan }) => {
      const state = createMockState({
        settings: createMockSettingsState({
          "token-features": createMockTokenFeatures(features),
        }),
      });

      expect(getIsPaidPlan(state)).toEqual(isPaidPlan);
    },
  );
});
