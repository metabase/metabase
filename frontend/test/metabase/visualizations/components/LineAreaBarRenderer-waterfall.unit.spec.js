import "__support__/mocks"; // included explicitly whereas with e2e tests it comes with __support__/e2e

import {
  NumberColumn,
  StringColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  createFixture,
  cleanupFixture,
} from "../__support__/visualizations";

const DEFAULT_SETTINGS = {
  "graph.x_axis.scale": "ordinal",
  "graph.y_axis.scale": "linear",
  "graph.x_axis.axis_enabled": true,
  "graph.y_axis.axis_enabled": true,
  "graph.colors": ["#00FF00", "#FF0000"],
  series: () => DEFAULT_SERIES_SETTINGS,
  column: () => DEFAULT_COLUMN_SETTINGS,
};

const DEFAULT_SERIES_SETTINGS = {
  display: "bar",
};

const DEFAULT_COLUMN_SETTINGS = {
  date_style: "MMMM D, YYYY",
};

function MainSeries(settings, rows) {
  return {
    card: {
      display: "waterfall",
      visualization_settings: {
        ...DEFAULT_SETTINGS,
        ...settings,
      },
    },
    data: {
      cols: [
        StringColumn({
          display_name: "Product",
          source: "breakout",
          field_ref: ["field", 1, null],
        }),
        NumberColumn({
          display_name: "Profit",
          source: "aggregation",
          field_ref: ["field", 2, null],
        }),
      ],
      rows,
    },
  };
}

// jsdom doesn't support layout methods like getBBox, so we need to mock it.
window.SVGElement.prototype.getBBox = () => ({
  x: 0,
  y: 0,
  width: 1000,
  height: 1000,
});

describe("LineAreaBarRenderer-waterfall", () => {
  let element;
  const qsa = selector => [...element.querySelectorAll(selector)];

  beforeEach(function() {
    element = createFixture();
  });

  afterEach(function() {
    cleanupFixture(element);
  });

  it("should render a waterfall chart with one row", () => {
    const onHoverChange = jest.fn();
    const settings = {};
    const rows = [["Apple", 10]];
    renderLineAreaBar(element, [MainSeries(settings, rows)], {
      onHoverChange,
    });

    // 8 elements: 4 stacked bars for (1 row, 1 total)
    const barElements = qsa(".bar, .dot");
    expect(barElements.length).toEqual(8);

    // hover over each bar
    dispatchUIEvent(barElements[0], "mousemove");

    const { calls } = onHoverChange.mock;
    const values = calls.map(call => getDataKeyValues(call[0])[1].value);
    expect(values).toEqual([10]);
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Product", value: "Apple" },
      { key: "Profit", value: 10 },
    ]);
  });

  it("should render a waterfall chart with two rows", () => {
    const onHoverChange = jest.fn();
    const settings = {};
    const rows = [["Apple", 10], ["Banana", 4]];
    renderLineAreaBar(element, [MainSeries(settings, rows)], {
      onHoverChange,
    });

    // 12 elements: 4 stacked bars for (2 rows, 1 total)
    const barElements = qsa(".bar, .dot");
    expect(barElements.length).toEqual(12);

    // hover over each bar
    dispatchUIEvent(barElements[0], "mousemove");
    dispatchUIEvent(barElements[1], "mousemove");

    const { calls } = onHoverChange.mock;
    const values = calls.map(call => getDataKeyValues(call[0])[1].value);
    expect(values).toEqual([10, 4]);
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Product", value: "Apple" },
      { key: "Profit", value: 10 },
    ]);
    expect(getDataKeyValues(calls[1][0])).toEqual([
      { key: "Product", value: "Banana" },
      { key: "Profit", value: 4 },
    ]);
  });

  it("should render a waterfall chart with negative values", () => {
    const onHoverChange = jest.fn();
    const settings = {};
    const rows = [["X", -5], ["Y", -13], ["Z", -7]];
    renderLineAreaBar(element, [MainSeries(settings, rows)], {
      onHoverChange,
    });

    // 16 elements: 4 stacked bars for (3 rows, 1 total)
    const barElements = qsa(".bar, .dot");
    expect(barElements.length).toEqual(16);

    // hover over each bar
    dispatchUIEvent(barElements[0], "mousemove");
    dispatchUIEvent(barElements[1], "mousemove");
    dispatchUIEvent(barElements[2], "mousemove");

    const { calls } = onHoverChange.mock;
    const values = calls.map(call => getDataKeyValues(call[0])[1].value);
    expect(values).toEqual([-5, -13, -7]);
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Product", value: "X" },
      { key: "Profit", value: -5 },
    ]);
    expect(getDataKeyValues(calls[1][0])).toEqual([
      { key: "Product", value: "Y" },
      { key: "Profit", value: -13 },
    ]);
    expect(getDataKeyValues(calls[2][0])).toEqual([
      { key: "Product", value: "Z" },
      { key: "Profit", value: -7 },
    ]);
  });

  it("should render a waterfall chart without the total bar", () => {
    const onHoverChange = jest.fn();
    const settings = {
      "waterfall.show_total": false,
    };
    const rows = [["A", 3], ["B", 5], ["C", 7]];
    renderLineAreaBar(element, [MainSeries(settings, rows)], {
      onHoverChange,
    });

    // 12 elements: 4 stacked bars for (3 rows, no total)
    const barElements = qsa(".bar, .dot");
    expect(barElements.length).toEqual(12);
  });

  function getDataKeyValues(hover) {
    return hover.data.map(({ key, value }) => ({ key, value }));
  }
});
