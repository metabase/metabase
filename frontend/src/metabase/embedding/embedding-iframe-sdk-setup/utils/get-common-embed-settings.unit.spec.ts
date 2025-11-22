import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import { getCommonEmbedSettings } from "./get-common-embed-settings";

jest.mock("metabase/plugins", () => ({
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP: {
    isFeatureEnabled: jest.fn(),
  },
}));

describe("getCommonEmbedSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when simple embed feature is available (Enterprise)", () => {
    beforeEach(() => {
      (
        PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled as jest.Mock
      ).mockReturnValue(true);
    });

    describe("with guest embeds enabled and state.isGuestEmbed is true", () => {
      it("should return guest embed settings for dashboard experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: true, useExistingUserSession: false },
          experience: "dashboard" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: true,
          useExistingUserSession: false,
          drills: false,
        });
      });

      it("should return guest embed settings for chart experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: true, useExistingUserSession: false },
          experience: "chart" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: true,
          useExistingUserSession: false,
          drills: false,
        });
      });

      it("should return guest embed settings for exploration experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: true, useExistingUserSession: true },
          experience: "exploration" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: true,
        });
      });

      it("should return guest embed settings for browser experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: true, useExistingUserSession: true },
          experience: "browser" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: true,
        });
      });

      it("should return guest embed settings for metabot experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: true, useExistingUserSession: true },
          experience: "metabot" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: true,
        });
      });
    });

    describe("with guest embeds disabled", () => {
      it("should return non-guest settings for dashboard experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: false, useExistingUserSession: true },
          experience: "dashboard" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: false,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: true,
          drills: true,
        });
      });

      it("should return non-guest settings for chart experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: false, useExistingUserSession: false },
          experience: "chart" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: false,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: false,
          drills: true,
        });
      });

      it("should return non-guest settings for exploration experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: false, useExistingUserSession: true },
          experience: "exploration" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: false,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: true,
        });
      });

      it("should handle undefined state", () => {
        const result = getCommonEmbedSettings({
          state: undefined,
          experience: "dashboard" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: false,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: undefined,
          drills: true,
        });
      });
    });

    describe("with guest embeds enabled but state.isGuestEmbed is false", () => {
      it("should return non-guest settings for dashboard experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: false, useExistingUserSession: true },
          experience: "dashboard" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: true,
          drills: true,
        });
      });

      it("should return non-guest settings for exploration experience", () => {
        const result = getCommonEmbedSettings({
          state: { isGuestEmbed: false, useExistingUserSession: false },
          experience: "exploration" as SdkIframeEmbedSetupExperience,
          isGuestEmbedsEnabled: true,
        });

        expect(result).toEqual({
          isGuestEmbed: false,
          useExistingUserSession: false,
        });
      });
    });
  });

  describe("when simple embed feature is not available (OSS)", () => {
    beforeEach(() => {
      (
        PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled as jest.Mock
      ).mockReturnValue(false);
    });

    it("should return guest embed settings with drills=false for dashboard experience", () => {
      const result = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: true },
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuestEmbed: true,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
      });
    });

    it("should return guest embed settings with drills=false for chart experience", () => {
      const result = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: true },
        experience: "chart" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuestEmbed: true,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
      });
    });

    it("should return non-guest settings for exploration experience", () => {
      const result = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: true },
        experience: "exploration" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuestEmbed: false,
        useExistingUserSession: true,
      });
    });

    it("should return non-guest settings for browser experience", () => {
      const result = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: false },
        experience: "browser" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuestEmbed: false,
        useExistingUserSession: true,
      });
    });

    it("should return non-guest settings for metabot experience", () => {
      const result = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: false },
        experience: "metabot" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuestEmbed: false,
        useExistingUserSession: true,
      });
    });

    it("should ignore isGuestEmbedsEnabled parameter and always enable guest embeds for dashboard/chart", () => {
      const resultWithTrue = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: false },
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: true,
      });

      const resultWithFalse = getCommonEmbedSettings({
        state: { isGuestEmbed: false, useExistingUserSession: false },
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(resultWithTrue).toEqual(resultWithFalse);
      expect(resultWithTrue).toEqual({
        isGuestEmbed: true,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
      });
    });

    it("should force withDownloads=true for dashboard/chart when feature is not available", () => {
      const result = getCommonEmbedSettings({
        state: undefined,
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: true,
      });

      expect(result).toHaveProperty("withDownloads", true);
    });

    it("should handle undefined state in OSS mode", () => {
      const result = getCommonEmbedSettings({
        state: undefined,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        isGuestEmbedsEnabled: false,
      });

      expect(result).toEqual({
        isGuestEmbed: true,
        useExistingUserSession: false,
        drills: false,
        withDownloads: true,
      });
    });
  });
});
