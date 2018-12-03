import "__support__/mocks"; // included explicitly whereas with integrated tests it comes with __support__/integrated_tests

import {
  NumberColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  getFormattedTooltips,
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

describe("LineAreaBarRenderer-scatter", () => {
  let element;
  const qsa = selector => [
    ...window.document.documentElement.querySelectorAll(selector),
  ];

  beforeEach(function() {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="fixture" style="height: 800px; width: 1200px;">',
    );
    element = document.getElementById("fixture");
  });

  afterEach(function() {
    document.body.removeChild(document.getElementById("fixture"));
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
