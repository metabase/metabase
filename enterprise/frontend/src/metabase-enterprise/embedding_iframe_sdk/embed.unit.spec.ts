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
      new MetabaseEmbed({
        ...defaultSettings,
        dashboardId: 1,
        target: "#not-existent-target",
      });
    }).toThrow('cannot find embed container "#not-existent-target"');
  });

  it("throws when target element is undefined", () => {
    expect(() => {
      new MetabaseEmbed({
        ...defaultSettings,
        questionId: 1,
        // @ts-expect-error -- we are testing for incorrect configuration
        target: undefined,
      });
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

  it("does not throw an error when instanceUrl is updated to be the same", () => {
    expect(() => {
      const embed = new MetabaseEmbed({
        ...defaultSettings,
        instanceUrl: "https://foo-bar-baz.com",
        questionId: 10,
        target: document.createElement("div"),
      });

      embed.updateSettings({ instanceUrl: "https://foo-bar-baz.com" });
    }).not.toThrow();
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

  it("throws when neither question id, dashboard id, or template are provided", () => {
    expect(() => {
      // @ts-expect-error -- we are testing for incorrect configuration
      new MetabaseEmbed({ ...defaultSettings });
    }).toThrow("either dashboardId, questionId, or template must be provided");
  });

  it.each([["view-content"], ["curate-content"]] as const)(
    "throws when initialCollection is not provided for the %s template",
    (template: "view-content" | "curate-content") => {
      expect(() => {
        // @ts-expect-error -- we are testing for incorrect configuration
        new MetabaseEmbed({
          ...defaultSettings,
          template,
        });
      }).toThrow(
        `initialCollection must be provided for the ${template} template`,
      );
    },
  );
});
