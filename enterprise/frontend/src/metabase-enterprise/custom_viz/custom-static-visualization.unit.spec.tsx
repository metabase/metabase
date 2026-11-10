import { renderToStaticMarkup } from "react-dom/server";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import { CustomStaticVisualization } from "metabase/static-viz/components/StaticVisualization/CustomStaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { StaticVisualizationProps } from "metabase/viz-core";
import type {
  CustomVizDisplayType,
  RawSeries,
  RowValue,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import createExampleVisualization from "../../custom-viz/fixtures/example_custom_viz_plugin/src/index";

import {
  customVizRegistry,
  registerCustomVizPlugin,
} from "./custom-viz-static";

const IDENTIFIER = "static-example";
const DISPLAY = `custom:${IDENTIFIER}` as const;
const PLUGIN_ID = 1;

function makeRawSeries(
  value: RowValue,
  display: CustomVizDisplayType = DISPLAY,
): RawSeries {
  return [
    {
      card: createMockCard({ display }),
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
          }),
        ],
        rows: [[value]],
      }),
    },
  ];
}

function setup(
  props: Partial<StaticVisualizationProps> &
    Pick<StaticVisualizationProps, "rawSeries">,
) {
  return {
    markup: renderToStaticMarkup(
      <CustomStaticVisualization
        renderingContext={createStaticRenderingContext()}
        {...props}
      />,
    ),
  };
}

beforeAll(() => {
  Object.assign(PLUGIN_CUSTOM_VIZ, {
    customVizRegistry,
    registerCustomVizPlugin,
  });
  registerCustomVizPlugin(createExampleVisualization, IDENTIFIER, PLUGIN_ID);
});

describe("CustomStaticVisualization", () => {
  it("renders nothing for a display with no registered plugin, so the backend falls back to a table", () => {
    const { markup } = setup({
      rawSeries: makeRawSeries(5, "custom:unregistered"),
    });

    expect(markup).toBe("");
  });

  it("renders the plugin's SVG at its natural size when the host passes no size", () => {
    const { markup } = setup({ rawSeries: makeRawSeries(5) });

    expect(markup).toMatch(/^<svg/);
    expect(markup).toContain('width="540"');
    expect(markup).toContain('height="360"');
  });

  it("renders at the host's size when the layout is host-controlled", () => {
    const { markup } = setup({
      rawSeries: makeRawSeries(5),
      width: 300,
      height: 200,
    });

    expect(markup).toContain('width="300"');
    expect(markup).toContain('height="200"');
  });

  it("hands the plugin its own settings and the host rendering context", () => {
    const brandColor = createStaticRenderingContext().getColor("core-brand");

    expect(setup({ rawSeries: makeRawSeries(5) }).markup).toContain(
      "above threshold",
    );
    expect(setup({ rawSeries: makeRawSeries(-5) }).markup).toContain(
      "below threshold",
    );
    expect(setup({ rawSeries: makeRawSeries(5) }).markup).toContain(
      `fill="${brandColor}"`,
    );
  });

  it("lets a plugin error propagate so the backend renders the error card", () => {
    expect(() => setup({ rawSeries: makeRawSeries("not-a-number") })).toThrow(
      "Value and threshold need to be numbers",
    );
  });
});
