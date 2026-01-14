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
            experience,
            isGuestEmbedsEnabled: true,
            isSsoEnabledAndConfigured: true,
            isGuest: true,
            useExistingUserSession,
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
            experience,
            isGuestEmbedsEnabled: false,
            isSsoEnabledAndConfigured,
            isGuest: false,
            useExistingUserSession,
          });

          expect(result).toEqual(expected);
        },
      );

      it("should reset hiddenParameters for chart but not for dashboard in non-guest mode", () => {
        const chartResult = getCommonEmbedSettings({
          experience: "chart",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: true,
          isGuest: false,
          useExistingUserSession: true,
        });

        const dashboardResult = getCommonEmbedSettings({
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: true,
          isGuest: false,
          useExistingUserSession: true,
        });

        expect(chartResult).toHaveProperty("hiddenParameters", []);
        expect(dashboardResult).not.toHaveProperty("hiddenParameters");
      });

      it("should handle `false` for isGuest and `useExistingUserSession`", () => {
        const result = getCommonEmbedSettings({
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: true,
          isGuest: false,
          useExistingUserSession: false,
        });

        expect(result).toEqual({
          isGuest: false,
          isSso: true,
          useExistingUserSession: false,
          drills: true,
        });
      });

      it("should set useExistingUserSession to true when isSsoEnabledAndConfigured is false", () => {
        const result = getCommonEmbedSettings({
          experience: "dashboard",
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: false,
          isGuest: false,
          useExistingUserSession: false,
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
            experience,
            isGuestEmbedsEnabled: true,
            isSsoEnabledAndConfigured: true,
            isGuest: false,
            useExistingUserSession,
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
          experience,
          isGuestEmbedsEnabled: false,
          isSsoEnabledAndConfigured: false,
          isGuest: false,
          useExistingUserSession: false,
        });

        expect(result).toEqual(expected);
      },
    );

    it("should ignore isGuestEmbedsEnabled parameter for dashboard/chart", () => {
      const resultWithTrue = getCommonEmbedSettings({
        experience: "dashboard",
        isGuestEmbedsEnabled: true,
        isSsoEnabledAndConfigured: false,
        isGuest: false,
        useExistingUserSession: false,
      });

      const resultWithFalse = getCommonEmbedSettings({
        experience: "dashboard",
        isGuestEmbedsEnabled: false,
        isSsoEnabledAndConfigured: false,
        isGuest: false,
        useExistingUserSession: false,
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
        experience: "dashboard",
        isGuestEmbedsEnabled: true,
        isSsoEnabledAndConfigured: false,
        isGuest: false,
        useExistingUserSession: false,
      });

      expect(result).toHaveProperty("withDownloads", true);
    });

    it("should handle false for isGuest and useExistingUserSession", () => {
      const result = getCommonEmbedSettings({
        experience: "chart",
        isGuestEmbedsEnabled: false,
        isSsoEnabledAndConfigured: false,
        isGuest: false,
        useExistingUserSession: false,
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
