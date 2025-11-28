import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import { getCommonEmbedSettings } from "./get-common-embed-settings";

jest.mock("metabase/plugins", () => ({
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP: {
    isFeatureEnabled: jest.fn(),
  },
}));

const mockIsFeatureEnabled = (enabled: boolean) => {
  (
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled as jest.Mock
  ).mockReturnValue(enabled);
};

describe("getCommonEmbedSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when simple embed feature is available (Enterprise)", () => {
    beforeEach(() => {
      mockIsFeatureEnabled(true);
    });

    describe("with guest embeds enabled and state.isGuest is true", () => {
      it.each<{
        experience: SdkIframeEmbedSetupExperience;
        useExistingUserSession: boolean;
        expected: Record<string, unknown>;
      }>([
        {
          experience: "dashboard",
          useExistingUserSession: false,
          expected: {
            isGuest: true,
            useExistingUserSession: false,
            drills: false,
            hiddenParameters: [],
          },
        },
        {
          experience: "chart",
          useExistingUserSession: false,
          expected: {
            isGuest: true,
            useExistingUserSession: false,
            drills: false,
            hiddenParameters: [],
          },
        },
        {
          experience: "exploration",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            useExistingUserSession: true,
            hiddenParameters: [],
          },
        },
        {
          experience: "browser",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            useExistingUserSession: true,
            hiddenParameters: [],
          },
        },
        {
          experience: "metabot",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            useExistingUserSession: true,
            hiddenParameters: [],
          },
        },
      ])(
        "should return correct settings for $experience experience",
        ({ experience, useExistingUserSession, expected }) => {
          const result = getCommonEmbedSettings({
            state: { isGuest: true, useExistingUserSession },
            experience,
            isGuestEmbedsEnabled: true,
          });

          expect(result).toEqual(expected);
        },
      );
    });

    describe("with guest embeds disabled", () => {
      it.each<{
        experience: SdkIframeEmbedSetupExperience;
        useExistingUserSession: boolean;
        expected: Record<string, unknown>;
      }>([
        {
          experience: "dashboard",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            useExistingUserSession: true,
            drills: true,
          },
        },
        {
          experience: "chart",
          useExistingUserSession: false,
          expected: {
            isGuest: false,
            useExistingUserSession: false,
            drills: true,
            hiddenParameters: [],
          },
        },
        {
          experience: "exploration",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            useExistingUserSession: true,
          },
        },
      ])(
        "should return non-guest settings for $experience experience",
        ({ experience, useExistingUserSession, expected }) => {
          const result = getCommonEmbedSettings({
            state: { isGuest: false, useExistingUserSession },
            experience,
            isGuestEmbedsEnabled: false,
          });

          expect(result).toEqual(expected);
        },
      );

      it("should reset hiddenParameters for chart but not for dashboard in non-guest mode", () => {
        const chartResult = getCommonEmbedSettings({
          state: { isGuest: false, useExistingUserSession: true },
          experience: "chart",
          isGuestEmbedsEnabled: false,
        });

        const dashboardResult = getCommonEmbedSettings({
          state: { isGuest: false, useExistingUserSession: true },
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
        });

        expect(chartResult).toHaveProperty("hiddenParameters", []);
        expect(dashboardResult).not.toHaveProperty("hiddenParameters");
      });

      it("should handle undefined state", () => {
        const result = getCommonEmbedSettings({
          state: undefined,
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
        });

        expect(result).toEqual({
          isGuest: false,
          useExistingUserSession: undefined,
          drills: true,
        });
      });
    });

    describe("with guest embeds enabled but state.isGuest is false", () => {
      it.each<{
        experience: SdkIframeEmbedSetupExperience;
        useExistingUserSession: boolean;
        expected: Record<string, unknown>;
      }>([
        {
          experience: "dashboard",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            useExistingUserSession: true,
            drills: true,
          },
        },
        {
          experience: "exploration",
          useExistingUserSession: false,
          expected: {
            isGuest: false,
            useExistingUserSession: false,
          },
        },
      ])(
        "should return non-guest settings for $experience experience",
        ({ experience, useExistingUserSession, expected }) => {
          const result = getCommonEmbedSettings({
            state: { isGuest: false, useExistingUserSession },
            experience,
            isGuestEmbedsEnabled: true,
          });

          expect(result).toEqual(expected);
        },
      );
    });
  });

  describe("when simple embed feature is not available (OSS)", () => {
    beforeEach(() => {
      mockIsFeatureEnabled(false);
    });

    it.each<{
      experience: SdkIframeEmbedSetupExperience;
      expected: Record<string, unknown>;
    }>([
      {
        experience: "dashboard",
        expected: {
          isGuest: true,
          useExistingUserSession: false,
          drills: false,
          withDownloads: true,
          hiddenParameters: [],
        },
      },
      {
        experience: "chart",
        expected: {
          isGuest: true,
          useExistingUserSession: false,
          drills: false,
          withDownloads: true,
          hiddenParameters: [],
        },
      },
      {
        experience: "exploration",
        expected: {
          isGuest: false,
          useExistingUserSession: true,
          hiddenParameters: [],
        },
      },
      {
        experience: "browser",
        expected: {
          isGuest: false,
          useExistingUserSession: true,
          hiddenParameters: [],
        },
      },
      {
        experience: "metabot",
        expected: {
          isGuest: false,
          useExistingUserSession: true,
          hiddenParameters: [],
        },
      },
    ])(
      "should return correct settings for $experience experience",
      ({ experience, expected }) => {
        const result = getCommonEmbedSettings({
          state: { isGuest: false, useExistingUserSession: false },
          experience,
          isGuestEmbedsEnabled: false,
        });

        expect(result).toEqual(expected);
      },
    );

    it("should ignore isGuestEmbedsEnabled parameter for dashboard/chart", () => {
      const resultWithTrue = getCommonEmbedSettings({
        state: { isGuest: false, useExistingUserSession: false },
        experience: "dashboard",
        isGuestEmbedsEnabled: true,
      });

      const resultWithFalse = getCommonEmbedSettings({
        state: { isGuest: false, useExistingUserSession: false },
        experience: "dashboard",
        isGuestEmbedsEnabled: false,
      });

      expect(resultWithTrue).toEqual(resultWithFalse);
      expect(resultWithTrue).toEqual({
        isGuest: true,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
        hiddenParameters: [],
      });
    });

    it("should force withDownloads=true for dashboard/chart", () => {
      const result = getCommonEmbedSettings({
        state: undefined,
        experience: "dashboard",
        isGuestEmbedsEnabled: true,
      });

      expect(result).toHaveProperty("withDownloads", true);
    });

    it("should handle undefined state", () => {
      const result = getCommonEmbedSettings({
        state: undefined,
        experience: "chart",
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuest: true,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
        hiddenParameters: [],
      });
    });
  });
});
