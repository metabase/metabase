import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import {
  getRawSeriesWithDashcardSettings,
  registerCustomVizPluginFromGlobal,
  toRenderedChart,
} from "./entrypoint";

type CustomVizFactory = Parameters<
  typeof PLUGIN_CUSTOM_VIZ.registerCustomVizPlugin
>[0];

// Plugin bundles assign this global at eval time, so it isn't part of the
// typed global scope (mirrors the cast in entrypoint.ts).
const globals = globalThis as {
  __customVizPlugin__?: CustomVizFactory | string;
};

describe("toRenderedChart", () => {
  it("detects markup starting with <svg as an svg chart", () => {
    expect(toRenderedChart('<svg width="10"></svg>')).toEqual({
      type: "svg",
      content: '<svg width="10"></svg>',
    });
  });

  it.each([
    ["an html element", "<div>chart</div>"],
    ["empty content", ""],
    ["leading whitespace before <svg", " <svg></svg>"],
  ])("treats %s as html", (_name, content) => {
    expect(toRenderedChart(content)).toEqual({ type: "html", content });
  });
});

describe("getRawSeriesWithDashcardSettings", () => {
  it("merges dashcard settings into the main card only", () => {
    const mainSeries = createMockSingleSeries({
      display: "bar",
      visualization_settings: { "graph.x_axis.title_text": "Original" },
    });
    const secondSeries = createMockSingleSeries({ id: 2, display: "bar" });

    const result = getRawSeriesWithDashcardSettings(
      [mainSeries, secondSeries],
      { "card.title": "Dashcard title" },
    );

    expect(result[0].card.visualization_settings).toMatchObject({
      "graph.x_axis.title_text": "Original",
      "card.title": "Dashcard title",
    });
    expect(result[1]).toBe(secondSeries);
  });
});

describe("registerCustomVizPluginFromGlobal", () => {
  afterEach(() => {
    globals.__customVizPlugin__ = undefined;
    jest.restoreAllMocks();
  });

  it("consumes the factory global and delegates registration", () => {
    const registerSpy = jest
      .spyOn(PLUGIN_CUSTOM_VIZ, "registerCustomVizPlugin")
      .mockImplementation(() => {});
    const factory: CustomVizFactory = () => ({});
    globals.__customVizPlugin__ = factory;

    registerCustomVizPluginFromGlobal("demo", 7);

    expect(registerSpy).toHaveBeenCalledWith(factory, "demo", 7);
    expect(globals.__customVizPlugin__).toBeUndefined();
  });

  it("throws when the bundle did not assign a factory", () => {
    expect(() => registerCustomVizPluginFromGlobal("demo", 7)).toThrow(
      'Custom viz plugin "demo" did not assign a factory function to __customVizPlugin__ (got undefined).',
    );
  });
});
