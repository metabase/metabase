import ReactDOMServer from "react-dom/server";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { VisualizationDisplay } from "metabase-types/api";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import { CustomStaticVisualization } from "./CustomStaticVisualization";

type RegistryVizDef = Parameters<
  typeof PLUGIN_CUSTOM_VIZ.customVizRegistry.set
>[1];

interface SetupOpts {
  display: VisualizationDisplay;
  vizDef?: RegistryVizDef;
}

function setup({ display, vizDef }: SetupOpts) {
  if (vizDef) {
    PLUGIN_CUSTOM_VIZ.customVizRegistry.set(display, vizDef);
  }
  const rawSeries = [
    createMockSingleSeries({ display }, { data: { rows: [[42]] } }),
  ];
  return {
    markup: ReactDOMServer.renderToStaticMarkup(
      <CustomStaticVisualization
        rawSeries={rawSeries}
        renderingContext={createStaticRenderingContext()}
      />,
    ),
  };
}

describe("CustomStaticVisualization", () => {
  afterEach(() => {
    PLUGIN_CUSTOM_VIZ.customVizRegistry.clear();
  });

  it("throws on a non-custom display", () => {
    expect(() => setup({ display: "bar" })).toThrow(
      "Unsupported display type for custom static visualization: bar",
    );
  });

  it("renders empty markup when no plugin registered the display", () => {
    const { markup } = setup({ display: "custom:unregistered" });

    expect(markup).toBe("");
  });

  it("renders empty markup when the registered plugin exports no StaticVisualizationComponent", () => {
    const { markup } = setup({
      display: "custom:no-static-component",
      vizDef: {},
    });

    expect(markup).toBe("");
  });
});
