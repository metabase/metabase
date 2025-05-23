import { MetabaseEmbed } from "./embed";

describe("embed.js script tag for sdk iframe embedding", () => {
  const defaultSettings = {
    apiKey: "test-api-key",
    instanceUrl: "http://localhost:3000",

    // this will fail due to the target being missing,
    // but the errors for incompatible configuration will throw first.
    target: "#non-existent-target",
  };

  it("throws when target element is not found", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({ ...defaultSettings, target: "#not-existent-target" });
    }).toThrow('cannot find embed container "#not-existent-target"');
  });

  it("throws when target element is undefined", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({ ...defaultSettings, target: undefined });
    }).toThrow("target must be provided");
  });

  it("throws when api key is not provided", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({ ...defaultSettings, apiKey: undefined });
    }).toThrow("API key and instance URL must be provided");
  });

  it("throws when instance url is not provided", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({ ...defaultSettings, instanceUrl: undefined });
    }).toThrow("API key and instance URL must be provided");
  });

  it("throws when both question id and dashboard id are provided", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({
        ...defaultSettings,
        questionId: 10,
        dashboardId: 10,
      });
    }).toThrow("can't use both dashboardId and questionId at the same time");
  });

  it("throws when question id is provided in the exploration template", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({
        ...defaultSettings,
        template: "exploration",
        questionId: 10,
      });
    }).toThrow(
      "the exploration template can't be used with dashboardId or questionId",
    );
  });

  it("throws when dashboard id is provided in the exploration template", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({
        ...defaultSettings,
        template: "exploration",
        dashboardId: 10,
      });
    }).toThrow(
      "the exploration template can't be used with dashboardId or questionId",
    );
  });
});
