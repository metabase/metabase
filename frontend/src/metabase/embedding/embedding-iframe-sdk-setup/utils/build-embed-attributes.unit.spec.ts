import type {
  SdkIframeEmbedSetupExperience,
  SdkIframeEmbedSetupSettings,
} from "metabase/embedding/embedding-iframe-sdk-setup/types";

import {
  buildEmbedAttributes,
  formatAttributeValue,
} from "./build-embed-attributes";

// Mock getVisibleParameters
jest.mock("./get-visible-parameters", () => ({
  getVisibleParameters: jest.fn((params, locked) => {
    if (!params || !locked?.length) {
      return params;
    }
    const filtered = Object.fromEntries(
      Object.entries(params).filter(([key]) => !locked.includes(key)),
    );
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }),
}));

describe("buildEmbedAttributes", () => {
  describe("chart experience", () => {
    it("should build attributes for chart with guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        isGuest: true,
        withTitle: true,
        withDownloads: false,
        drills: true,
        initialSqlParameters: { param1: "value1", param2: "value2" },
        lockedParameters: ["param2"],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: "test-token",
        wrapWithQuotes: true,
      });

      // Note: drills is not in ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP for chart
      expect(result).toEqual({
        token: '"test-token"',
        "initial-sql-parameters": `'{"param1":"value1"}'`,
        "with-title": '"true"',
        "with-downloads": '"false"',
      });
    });

    it("should build attributes for chart without guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        isGuest: false,
        withTitle: false,
        withDownloads: true,
        drills: false,
        initialSqlParameters: { param1: "value1" },
        hiddenParameters: ["param2"],
        isSaveEnabled: true,
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "question-id": '"123"',
        "is-save-enabled": '"true"',
        "initial-sql-parameters": `'{"param1":"value1"}'`,
        "hidden-parameters": `'["param2"]'`,
        "with-title": '"false"',
        drills: '"false"',
        "with-downloads": '"true"',
      });
    });

    it("should handle chart with entityTypes", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        isGuest: false,
        entityTypes: ["model", "table"],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "question-id": '"123"',
        "entity-types": `'["model","table"]'`,
      });
    });

    it("should handle chart with targetCollection", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        isGuest: false,
        targetCollection: 456,
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      // Note: template is not in ALLOWED_EMBED_SETTING_KEYS_MAP for chart
      expect(result).toEqual({
        "question-id": '"123"',
      });
    });

    it("should omit hiddenParameters if empty array for chart", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        isGuest: false,
        hiddenParameters: [],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "question-id": '"123"',
      });
    });

    it("should filter locked parameters from initialSqlParameters for guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        isGuest: true,
        initialSqlParameters: {
          param1: "value1",
          param2: "value2",
          param3: "value3",
        },
        lockedParameters: ["param2", "param3"],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: "test-token",
        wrapWithQuotes: true,
      });

      expect(result["initial-sql-parameters"]).toBe(`'{"param1":"value1"}'`);
    });
  });

  describe("dashboard experience", () => {
    it("should build attributes for dashboard with guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-dashboard",
        dashboardId: 456,
        isGuest: true,
        withTitle: true,
        withDownloads: true,
        drills: false,
        initialParameters: { filter1: "value1", filter2: "value2" },
        lockedParameters: ["filter2"],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        token: "test-token",
        wrapWithQuotes: true,
      });

      // Note: drills is not in ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP for dashboard
      expect(result).toEqual({
        token: '"test-token"',
        "initial-parameters": `'{"filter1":"value1"}'`,
        "with-title": '"true"',
        "with-downloads": '"true"',
      });
    });

    it("should build attributes for dashboard without guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-dashboard",
        dashboardId: 456,
        isGuest: false,
        withTitle: false,
        withDownloads: false,
        drills: true,
        initialParameters: { filter1: "value1" },
        hiddenParameters: ["filter2"],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "dashboard-id": '"456"',
        "initial-parameters": `'{"filter1":"value1"}'`,
        "hidden-parameters": `'["filter2"]'`,
        "with-title": '"false"',
        drills: '"true"',
        "with-downloads": '"false"',
      });
    });

    it("should omit hiddenParameters if empty array for dashboard", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-dashboard",
        dashboardId: 456,
        isGuest: false,
        hiddenParameters: [],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "dashboard-id": '"456"',
      });
    });

    it("should filter locked parameters from initialParameters for guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-dashboard",
        dashboardId: 456,
        isGuest: true,
        initialParameters: {
          filter1: "value1",
          filter2: "value2",
          filter3: "value3",
        },
        lockedParameters: ["filter1", "filter3"],
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "dashboard" as SdkIframeEmbedSetupExperience,
        token: "test-token",
        wrapWithQuotes: true,
      });

      expect(result["initial-parameters"]).toBe(`'{"filter2":"value2"}'`);
    });
  });

  describe("exploration experience", () => {
    it("should build attributes for exploration without guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        targetCollection: 789,
        entityTypes: ["model", "table"],
        isSaveEnabled: true,
        apiKey: "test-api-key",
        template: "exploration",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "exploration" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "question-id": '"new"',
        "target-collection": '"789"',
        "entity-types": `'["model","table"]'`,
        "is-save-enabled": '"true"',
      });
    });

    it("should build attributes for exploration with guest embed", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        isGuest: true,
        targetCollection: 789,
        entityTypes: ["model"],
        apiKey: "test-api-key",
        template: "exploration",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "exploration" as SdkIframeEmbedSetupExperience,
        token: "test-token",
        wrapWithQuotes: true,
      });

      // Note: ALLOWED_GUEST_EMBED_SETTING_KEYS_MAP.exploration is empty
      expect(result).toEqual({});
    });

    it("should omit isSaveEnabled for guest embed exploration", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        isGuest: true,
        targetCollection: 789,
        isSaveEnabled: true,
        apiKey: "test-api-key",
        template: "exploration",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "exploration" as SdkIframeEmbedSetupExperience,
        token: "test-token",
        wrapWithQuotes: true,
      });

      expect(result).not.toHaveProperty("is-save-enabled");
    });
  });

  describe("base settings exclusion", () => {
    it("should exclude base configuration keys from attributes", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        apiKey: "test-api-key",
        theme: { colors: { primary: "#000" } },
        locale: "en",
        preferredAuthMethod: "jwt",
        isGuest: false,
      } as SdkIframeEmbedSetupSettings;

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).not.toHaveProperty("api-key");
      expect(result).not.toHaveProperty("theme");
      expect(result).not.toHaveProperty("locale");
      expect(result).not.toHaveProperty("preferred-auth-method");
      expect(result).not.toHaveProperty("is-guest-embed");
    });
  });

  describe("wrapWithQuotes parameter", () => {
    it("should not wrap values with quotes when wrapWithQuotes is false", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        componentName: "metabase-question",
        questionId: 123,
        withTitle: true,
        initialSqlParameters: { param1: "value1" },
        apiKey: "test-api-key",
      };

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: false,
      });

      expect(result).toEqual({
        "question-id": "123",
        "initial-sql-parameters": `{"param1":"value1"}`,
        "with-title": "true",
      });
    });
  });

  describe("undefined and null values", () => {
    it("should omit undefined values from attributes", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        questionId: 123,
        withTitle: undefined,
        drills: undefined,
        apiKey: "test-api-key",
      } as SdkIframeEmbedSetupSettings;

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "question-id": '"123"',
      });
    });

    it("should omit null values from attributes", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        questionId: 123,
        withTitle: null as any,
        drills: null as any,
        apiKey: "test-api-key",
      } as SdkIframeEmbedSetupSettings;

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toEqual({
        "question-id": '"123"',
      });
    });
  });

  describe("camelCase to dash-case conversion", () => {
    it("should convert camelCase keys to dash-case", () => {
      const settings: SdkIframeEmbedSetupSettings = {
        questionId: 123,
        isSaveEnabled: true,
        initialSqlParameters: { param: "value" },
        hiddenParameters: ["param"],
        apiKey: "test-api-key",
      } as unknown as SdkIframeEmbedSetupSettings;

      const result = buildEmbedAttributes({
        settings,
        experience: "chart" as SdkIframeEmbedSetupExperience,
        token: null,
        wrapWithQuotes: true,
      });

      expect(result).toHaveProperty("question-id");
      expect(result).toHaveProperty("is-save-enabled");
      expect(result).toHaveProperty("initial-sql-parameters");
      expect(result).toHaveProperty("hidden-parameters");
      expect(result).not.toHaveProperty("questionId");
      expect(result).not.toHaveProperty("isSaveEnabled");
    });
  });
});

describe("formatAttributeValue", () => {
  it("should format string values correctly", () => {
    expect(formatAttributeValue("hello")).toBe('"hello"');
  });

  it("should format number values correctly", () => {
    expect(formatAttributeValue(42)).toBe('"42"');
    expect(formatAttributeValue(3.14)).toBe('"3.14"');
  });

  it("should format boolean values correctly", () => {
    expect(formatAttributeValue(true)).toBe('"true"');
    expect(formatAttributeValue(false)).toBe('"false"');
  });

  it("should format array values correctly", () => {
    expect(formatAttributeValue([1, 2, 3])).toBe("'[1,2,3]'");
    expect(formatAttributeValue(["a", "b", "c"])).toBe('\'["a","b","c"]\'');
    expect(formatAttributeValue([1, "b", true])).toBe("'[1,\"b\",true]'");
  });

  it("should HTML escape single quotes in array and objects", () => {
    expect(formatAttributeValue(["O'Reilly", "D'Angelo"])).toBe(
      `'["O&#39;Reilly","D&#39;Angelo"]'`,
    );
    expect(formatAttributeValue({ quote: "It's a test" })).toBe(
      `'{"quote":"It&#39;s a test"}'`,
    );
  });

  it("should HTML escape single quotes in nested arrays and objects", () => {
    expect(
      formatAttributeValue([{ name: "O'Reilly" }, { name: "D'Angelo" }]),
    ).toBe(`'[{"name":"O&#39;Reilly"},{"name":"D&#39;Angelo"}]'`);
    expect(formatAttributeValue({ nested: { quote: "It's a test" } })).toBe(
      `'{"nested":{"quote":"It&#39;s a test"}}'`,
    );
  });

  it("should format object values correctly", () => {
    expect(formatAttributeValue({ key: "value" })).toBe(`'{"key":"value"}'`);
    expect(formatAttributeValue({ a: 1, b: true })).toBe(`'{"a":1,"b":true}'`);
  });

  it("should handle nested arrays and objects", () => {
    expect(formatAttributeValue([{ a: 1 }, { b: 2 }])).toBe(
      `'[{"a":1},{"b":2}]'`,
    );
    expect(
      formatAttributeValue([
        [1, 2],
        [3, 4],
      ]),
    ).toBe("'[[1,2],[3,4]]'");
  });

  it("should handle null and undefined values", () => {
    expect(formatAttributeValue(null)).toBe("'null'");
    expect(formatAttributeValue(undefined)).toBe('"undefined"');
  });

  it("should not wrap with quotes if flag is passed to `false`", () => {
    expect(formatAttributeValue(42, false)).toBe("42");
    expect(formatAttributeValue({ a: 1, b: true }, false)).toBe(
      `{"a":1,"b":true}`,
    );
  });
});
