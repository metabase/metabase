import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import { getCommonEmbedSettings } from "./get-common-embed-settings";

jest.mock("metabase/plugins", () => ({
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP: {
    isEnabled: jest.fn(),
  },
}));

const mockIsPluginEnabled = (enabled: boolean) => {
  (PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled as jest.Mock).mockReturnValue(
    enabled,
  );
};

describe("getCommonEmbedSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when simple embed feature is available (Enterprise)", () => {
    beforeEach(() => {
      mockIsPluginEnabled(true);
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
            isSso: false,
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
            isSso: false,
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
            isSso: true,
            useExistingUserSession: true,
            hiddenParameters: [],
          },
        },
        {
          experience: "browser",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            isSso: true,
            useExistingUserSession: true,
            hiddenParameters: [],
          },
        },
        {
          experience: "metabot",
          useExistingUserSession: true,
          expected: {
            isGuest: false,
            isSso: true,
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
            isSsoEnabledAndConfigured: true,
          });

          expect(result).toEqual(expected);
        },
      );
    });

    describe("with guest embeds disabled", () => {
      it.each<{
        experience: SdkIframeEmbedSetupExperience;
        useExistingUserSession: boolean;
        isSsoEnabledAndConfigured: boolean;
        expected: Record<string, unknown>;
      }>([
        {
          experience: "dashboard",
          useExistingUserSession: true,
          isSsoEnabledAndConfigured: true,
          expected: {
            isGuest: false,
            isSso: true,
            useExistingUserSession: true,
            drills: true,
          },
        },
        {
          experience: "dashboard",
          useExistingUserSession: false,
          isSsoEnabledAndConfigured: false,
          expected: {
            isGuest: false,
            isSso: true,
            useExistingUserSession: true,
            drills: true,
          },
        },
        {
          experience: "chart",
          useExistingUserSession: false,
          isSsoEnabledAndConfigured: true,
          expected: {
            isGuest: false,
            isSso: true,
            useExistingUserSession: false,
            drills: true,
            hiddenParameters: [],
          },
        },
        {
          experience: "exploration",
          useExistingUserSession: true,
          isSsoEnabledAndConfigured: true,
          expected: {
            isGuest: false,
            isSso: true,
            useExistingUserSession: true,
          },
        },
      ])(
        "should return non-guest settings for $experience experience (useExistingUserSession=$useExistingUserSession, isSsoEnabledAndConfigured=$isSsoEnabledAndConfigured)",
        ({
          experience,
          useExistingUserSession,
          isSsoEnabledAndConfigured,
          expected,
        }) => {
          const result = getCommonEmbedSettings({
            state: { isGuest: false, useExistingUserSession },
            experience,
            isGuestEmbedsEnabled: false,
            isSsoEnabledAndConfigured,
          });

          expect(result).toEqual(expected);
        },
      );

      it("should reset hiddenParameters for chart but not for dashboard in non-guest mode", () => {
        const chartResult = getCommonEmbedSettings({
          state: { isGuest: false, useExistingUserSession: true },
          experience: "chart",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: true,
        });

        const dashboardResult = getCommonEmbedSettings({
          state: { isGuest: false, useExistingUserSession: true },
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: true,
        });

        expect(chartResult).toHaveProperty("hiddenParameters", []);
        expect(dashboardResult).not.toHaveProperty("hiddenParameters");
      });

      it("should handle undefined state", () => {
        const result = getCommonEmbedSettings({
          state: undefined,
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: true,
        });

        expect(result).toEqual({
          isGuest: false,
          isSso: true,
          useExistingUserSession: undefined,
          drills: true,
        });
      });

      it("should set useExistingUserSession to true when isSsoEnabledAndConfigured is false", () => {
        const result = getCommonEmbedSettings({
          state: { isGuest: false, useExistingUserSession: false },
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: false,
        });

        expect(result).toHaveProperty("useExistingUserSession", true);
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
            isSso: true,
            useExistingUserSession: true,
            drills: true,
          },
        },
        {
          experience: "exploration",
          useExistingUserSession: false,
          expected: {
            isGuest: false,
            isSso: true,
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
            isSsoEnabledAndConfigured: true,
          });

          expect(result).toEqual(expected);
        },
      );
    });
  });

  describe("when simple embed feature is not available (OSS)", () => {
    beforeEach(() => {
      mockIsPluginEnabled(false);
    });

    it.each<{
      experience: SdkIframeEmbedSetupExperience;
      expected: Record<string, unknown>;
    }>([
      {
        experience: "dashboard",
        expected: {
          isGuest: true,
          isSso: false,
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
          isSso: false,
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
          isSso: true,
          useExistingUserSession: true,
          hiddenParameters: [],
        },
      },
      {
        experience: "browser",
        expected: {
          isGuest: false,
          isSso: true,
          useExistingUserSession: true,
          hiddenParameters: [],
        },
      },
      {
        experience: "metabot",
        expected: {
          isGuest: false,
          isSso: true,
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
          isSsoEnabledAndConfigured: false,
        });

        expect(result).toEqual(expected);
      },
    );

    it("should ignore isGuestEmbedsEnabled parameter for dashboard/chart", () => {
      const resultWithTrue = getCommonEmbedSettings({
        state: { isGuest: false, useExistingUserSession: false },
        experience: "dashboard",
        isGuestEmbedsEnabled: true,
        isSsoEnabledAndConfigured: false,
      });

      const resultWithFalse = getCommonEmbedSettings({
        state: { isGuest: false, useExistingUserSession: false },
        experience: "dashboard",
        isGuestEmbedsEnabled: false,
        isSsoEnabledAndConfigured: false,
      });

      expect(resultWithTrue).toEqual(resultWithFalse);
      expect(resultWithTrue).toEqual({
        isGuest: true,
        isSso: false,
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
        isSsoEnabledAndConfigured: false,
      });

      expect(result).toHaveProperty("withDownloads", true);
    });

    it("should handle undefined state", () => {
      const result = getCommonEmbedSettings({
        state: undefined,
        experience: "chart",
        isGuestEmbedsEnabled: false,
        isSsoEnabledAndConfigured: false,
      });

      expect(result).toEqual({
        isGuest: true,
        isSso: false,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
        hiddenParameters: [],
      });
    });
  });
});
