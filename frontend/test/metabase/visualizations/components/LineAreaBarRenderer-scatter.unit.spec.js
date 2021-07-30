import "__support__/mocks"; // included explicitly whereas with e2e tests it comes with __support__/e2e

import {
  NumberColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  getFormattedTooltips,
  createFixture,
  cleanupFixture,
} from "../__support__/visualizations";

const DEFAULT_SETTINGS = {
  "graph.x_axis.scale": "linear",
  "graph.y_axis.scale": "linear",
  "graph.x_axis.axis_enabled": true,
  "graph.y_axis.axis_enabled": true,
  "graph.colors": ["#000000"],
  series: () => ({ display: "scatter" }),
  column: () => ({}),
};

// jsdom doesn't support layout methods like getBBox, so we need to mock it.
window.SVGElement.prototype.getBBox = () => ({
  x: 0,
  y: 0,
  width: 1000,
  height: 1000,
});

describe("LineAreaBarRenderer-scatter", () => {
  let element;
  const qsa = selector => [
    ...window.document.documentElement.querySelectorAll(selector),
  ];

  beforeEach(function() {
    element = createFixture();
  });

  afterEach(function() {
    cleanupFixture(element);
  });

  it("should render a scatter chart with 2 dimensions", () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(
      element,
      [
        {
          card: {
            display: "scatter",
            visualization_settings: DEFAULT_SETTINGS,
          },
          data: {
            cols: [
              NumberColumn({ display_name: "A", source: "breakout" }),
              NumberColumn({ display_name: "B", source: "breakout" }),
            ],
            rows: [[1, 2]],
          },
        },
      ],
      {
        onHoverChange,
      },
    );

    dispatchUIEvent(qsa(".bubble")[0], "mousemove");

    expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
      "1",
      "2",
    ]);
  });

  it("should render a scatter chart with 2 dimensions and 1 metric", () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(
      element,
      [
        {
          card: {
            display: "scatter",
            visualization_settings: DEFAULT_SETTINGS,
          },
          data: {
            cols: [
              NumberColumn({ display_name: "A", source: "breakout" }),
              NumberColumn({ display_name: "B", source: "breakout" }),
              NumberColumn({ display_name: "C", source: "aggregation" }),
            ],
            rows: [[1, 2, 3]],
          },
        },
      ],
      {
        onHoverChange,
      },
    );

    dispatchUIEvent(qsa(".bubble")[0], "mousemove");

    expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});
