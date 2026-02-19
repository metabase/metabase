import type { SdkIframeEmbedSetupExperience } from "../types";

import {
  getDefaultSdkIframeEmbedSettings,
  getExperienceFromSettings,
  getResourceIdFromSettings,
} from "./get-default-sdk-iframe-embed-setting";

jest.mock("./get-common-embed-settings", () => ({
  getCommonEmbedSettings: jest.fn(() => ({ isGuest: false })),
}));

const BASE_PARAMS = {
  initialState: undefined,
  resourceId: 123,
  isSimpleEmbedFeatureAvailable: true,
  isGuestEmbedsEnabled: false,
  isSsoEnabledAndConfigured: true,
} as const;

describe("getDefaultSdkIframeEmbedSettings", () => {
  describe.each<{
    experience: SdkIframeEmbedSetupExperience;
    componentName: string;
    expectedProps: Record<string, unknown>;
  }>([
    {
      experience: "dashboard",
      componentName: "metabase-dashboard",
      expectedProps: {
        dashboardId: 123,
        drills: true,
        withDownloads: false,
        withTitle: true,
      },
    },
    {
      experience: "chart",
      componentName: "metabase-question",
      expectedProps: {
        questionId: 123,
        drills: true,
        withDownloads: false,
        withTitle: true,
        isSaveEnabled: false,
        initialSqlParameters: {},
      },
    },
    {
      experience: "exploration",
      componentName: "metabase-question",
      expectedProps: { template: "exploration", isSaveEnabled: false },
    },
    {
      experience: "browser",
      componentName: "metabase-browser",
      expectedProps: { initialCollection: "root", readOnly: true },
    },
    {
      experience: "metabot",
      componentName: "metabase-metabot",
      expectedProps: {},
    },
  ])(
    "$experience experience",
    ({ experience, componentName, expectedProps }) => {
      it("returns correct component name and properties", () => {
        const result = getDefaultSdkIframeEmbedSettings({
          ...BASE_PARAMS,
          experience,
          isGuest: false,
          useExistingUserSession: false,
        });

        expect(result).toMatchObject({
          componentName,
          useExistingUserSession: true,
          ...expectedProps,
        });
      });
    },
  );

  describe("when simple embed feature is not available", () => {
    it("defaults theme to light preset", () => {
      const result = getDefaultSdkIframeEmbedSettings({
        ...BASE_PARAMS,
        experience: "dashboard",
        isSimpleEmbedFeatureAvailable: false,
        isGuest: false,
        useExistingUserSession: false,
      });

      expect(result.theme).toEqual({ preset: "light" });
    });
  });

  describe("when simple embed feature is available", () => {
    it("does not set a default theme", () => {
      const result = getDefaultSdkIframeEmbedSettings({
        ...BASE_PARAMS,
        experience: "dashboard",
        isSimpleEmbedFeatureAvailable: true,
        isGuest: false,
        useExistingUserSession: false,
      });

      expect(result.theme).toBeUndefined();
    });
  });
});

describe("getResourceIdFromSettings", () => {
  it.each([
    { settings: { initialCollection: "root" }, expected: "root" },
    { settings: { initialCollection: 42 }, expected: 42 },
    { settings: { dashboardId: 123 }, expected: 123 },
    { settings: { dashboardId: "abc" }, expected: "abc" },
    { settings: { questionId: 456 }, expected: 456 },
    { settings: { questionId: "xyz" }, expected: "xyz" },
    { settings: {}, expected: undefined },
    { settings: { componentName: "metabase-metabot" }, expected: undefined },
  ])("returns $expected for $settings", ({ settings, expected }) => {
    expect(getResourceIdFromSettings(settings as never)).toBe(expected);
  });
});

describe("getExperienceFromSettings", () => {
  it.each<{
    settings: Record<string, unknown>;
    expected: SdkIframeEmbedSetupExperience;
  }>([
    {
      settings: { template: "exploration", componentName: "metabase-question" },
      expected: "exploration",
    },
    {
      settings: { componentName: "metabase-question" },
      expected: "chart",
    },
    {
      settings: { componentName: "metabase-browser" },
      expected: "browser",
    },
    {
      settings: { componentName: "metabase-dashboard" },
      expected: "dashboard",
    },
    {
      settings: { componentName: "metabase-metabot" },
      expected: "metabot",
    },
  ])("returns $expected for $settings", ({ settings, expected }) => {
    expect(getExperienceFromSettings(settings as never)).toBe(expected);
  });
});
