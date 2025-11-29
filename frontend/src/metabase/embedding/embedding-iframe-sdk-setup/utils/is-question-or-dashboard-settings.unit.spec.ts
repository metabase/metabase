import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";

import { isQuestionOrDashboardSettings } from "./is-question-or-dashboard-settings";

describe("isQuestionOrDashboardSettings", () => {
  describe("dashboard experience", () => {
    it.each([
      { dashboardId: 123, description: "positive number", expected: true },
      { dashboardId: 0, description: "0", expected: true },
      { dashboardId: "123", description: "string", expected: true },
      { dashboardId: "", description: "empty string", expected: true },
      { dashboardId: false, description: "false", expected: true },
      { dashboardId: null, description: "null", expected: false },
      { dashboardId: undefined, description: "undefined", expected: false },
    ])(
      "should return $expected when dashboardId is $description",
      ({ dashboardId, expected }) => {
        const settings = {
          dashboardId,
          apiKey: "test-key",
        } as unknown as SdkIframeEmbedSetupSettings;

        const result = isQuestionOrDashboardSettings("dashboard", settings);

        expect(result).toBe(expected);
      },
    );

    it("should return false when questionId is provided instead of dashboardId", () => {
      const settings = {
        questionId: 123,
        apiKey: "test-key",
      } as unknown as SdkIframeEmbedSetupSettings;

      const result = isQuestionOrDashboardSettings("dashboard", settings);

      expect(result).toBe(false);
    });
  });

  describe("chart experience", () => {
    it.each([
      { questionId: 456, description: "positive number", expected: true },
      { questionId: 0, description: "0", expected: true },
      { questionId: "456", description: "string", expected: true },
      { questionId: "", description: "empty string", expected: true },
      { questionId: false, description: "false", expected: true },
      { questionId: null, description: "null", expected: false },
      { questionId: undefined, description: "undefined", expected: false },
    ])(
      "should return $expected when questionId is $description",
      ({ questionId, expected }) => {
        const settings = {
          questionId,
          apiKey: "test-key",
        } as unknown as SdkIframeEmbedSetupSettings;

        const result = isQuestionOrDashboardSettings("chart", settings);

        expect(result).toBe(expected);
      },
    );

    it("should return false when dashboardId is provided instead of questionId", () => {
      const settings = {
        dashboardId: 456,
        apiKey: "test-key",
      } as unknown as SdkIframeEmbedSetupSettings;

      const result = isQuestionOrDashboardSettings("chart", settings);

      expect(result).toBe(false);
    });
  });

  describe("other experiences", () => {
    it.each([
      {
        experience: "exploration" as SdkIframeEmbedSetupExperience,
        settings: { questionId: 123 },
        description: "exploration with questionId",
        expected: false,
      },
      {
        experience: "exploration" as SdkIframeEmbedSetupExperience,
        settings: { dashboardId: 123 },
        description: "exploration with dashboardId",
        expected: false,
      },
      {
        experience: "browser" as SdkIframeEmbedSetupExperience,
        settings: { questionId: 123, dashboardId: 456 },
        description: "browser with both IDs",
        expected: false,
      },
      {
        experience: "metabot" as SdkIframeEmbedSetupExperience,
        settings: { questionId: 123, dashboardId: 456 },
        description: "metabot with both IDs",
        expected: false,
      },
    ])(
      "should return $expected for $description",
      ({ experience, settings, expected }) => {
        const result = isQuestionOrDashboardSettings(
          experience,
          settings as unknown as SdkIframeEmbedSetupSettings,
        );

        expect(result).toBe(expected);
      },
    );
  });

  describe("edge cases", () => {
    it.each([
      {
        experience: "dashboard" as const,
        description: "dashboard",
        expected: true,
      },
      { experience: "chart" as const, description: "chart", expected: true },
    ])(
      "should return $expected when both IDs are present for $description experience",
      ({ experience, expected }) => {
        const settings = {
          dashboardId: 123,
          questionId: 456,
          apiKey: "test-key",
        } as unknown as SdkIframeEmbedSetupSettings;

        const result = isQuestionOrDashboardSettings(experience, settings);

        expect(result).toBe(expected);
      },
    );

    it.each([
      { settings: {}, description: "empty settings", expected: false },
      {
        settings: { apiKey: "test-key", withTitle: true },
        description: "settings without IDs",
        expected: false,
      },
    ])(
      "should return $expected for dashboard with $description",
      ({ settings, expected }) => {
        const result = isQuestionOrDashboardSettings(
          "dashboard",
          settings as SdkIframeEmbedSetupSettings,
        );

        expect(result).toBe(expected);
      },
    );
  });

  describe("type guard behavior", () => {
    it("should narrow type to SdkIframeDashboardEmbedSettings for dashboard", () => {
      const settings = {
        dashboardId: 123,
        apiKey: "test-key",
      } as unknown as SdkIframeEmbedSetupSettings;

      const result = isQuestionOrDashboardSettings("dashboard", settings);

      // Type guard should return true and narrow the type
      expect(result).toBe(true);
      // TypeScript should allow accessing dashboardId due to type narrowing
      expect(settings.dashboardId).toBe(123);
    });

    it("should narrow type to SdkIframeQuestionEmbedSettings for chart", () => {
      const settings = {
        questionId: 456,
        apiKey: "test-key",
      } as unknown as SdkIframeEmbedSetupSettings;

      const result = isQuestionOrDashboardSettings("chart", settings);

      // Type guard should return true and narrow the type
      expect(result).toBe(true);
      // TypeScript should allow accessing questionId due to type narrowing
      expect(settings.questionId).toBe(456);
    });
  });
});
