import "__support__/ui-mocks"; // included explicitly whereas with e2e tests it comes with __support__/e2e
import {
  NumberColumn,
  StringColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  createFixture,
  cleanupFixture,
} from "__support__/visualizations";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard } from "metabase-types/api/mocks";

registerVisualizations();

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

function MainSeries(chartType, settings = {}, { key = "A", value = 1 } = {}) {
  return {
    card: createMockCard({
      display: chartType,
      visualization_settings: {
        ...DEFAULT_SETTINGS,
        ...settings,
      },
    }),
    data: {
      cols: [
        StringColumn({
          name: "Category",
          display_name: "Category",
          source: "breakout",
          field_ref: ["field", 1, null],
        }),
        NumberColumn({
          name: "Sum",
          display_name: "Sum",
          source: "aggregation",
          field_ref: ["field", 2, null],
        }),
      ],
      rows: [[key, value]],
    },
  };
}

function ExtraSeries(count = 2) {
  return {
    card: createMockCard({}),
    data: {
      cols: [
        StringColumn({
          display_name: "Category",
          source: "breakout",
          field_ref: ["field", 3, null],
        }),
        NumberColumn({
          display_name: "Count",
          source: "aggregation",
          field_ref: ["field", 4, null],
        }),
      ],
      rows: [["A", count]],
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

describe("LineAreaBarRenderer-bar", () => {
  let element;
  const qsa = selector => [...element.querySelectorAll(selector)];

  beforeEach(function () {
    element = createFixture();
  });

  afterEach(function () {
    cleanupFixture(element);
  });

  it(`should render an bar chart with 1 series`, () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(element, [MainSeries("bar")], {
      onHoverChange,
    });

    // hover over each bar
    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");

    const { calls } = onHoverChange.mock;
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "Sum", value: 1 },
    ]);
  });

  it(`should render an bar chart with 2 series`, () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(element, [MainSeries("bar"), ExtraSeries()], {
      onHoverChange,
    });

    // hover over each bar
    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
    dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");

    const { calls } = onHoverChange.mock;
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "Sum", value: 1 },
    ]);
    expect(getDataKeyValues(calls[1][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "Count", value: 2 },
    ]);
  });

  it(`should render an bar stacked chart with 2 series`, () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(
      element,
      [MainSeries("bar", { "stackable.stack_type": "stacked" }), ExtraSeries()],
      {
        onHoverChange,
      },
    );

    // hover over each bar
    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
    dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");

    const { calls } = onHoverChange.mock;
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "Sum", value: 1 },
    ]);
    expect(getDataKeyValues(calls[1][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "Count", value: 2 },
    ]);
  });

  it(`should render an bar normalized chart with 2 series`, () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(
      element,
      [
        MainSeries("bar", { "stackable.stack_type": "normalized" }),
        ExtraSeries(),
      ],
      { onHoverChange },
    );

    // hover over each bar
    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
    dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");

    const { calls } = onHoverChange.mock;
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "% Sum", value: "33%" },
    ]);
    expect(getDataKeyValues(calls[1][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "% Count", value: "67%" },
    ]);
  });

  it(`should render a normalized bar chart with consistent precision`, () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(
      element,
      [
        MainSeries("bar", { "stackable.stack_type": "normalized" }),
        ExtraSeries(999),
      ],
      { onHoverChange },
    );

    // hover over each bar
    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
    dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");

    const values = onHoverChange.mock.calls.map(
      call => getDataKeyValues(call[0])[1].value,
    );
    expect(values).toEqual(["0.1%", "99.9%"]);
  });

  it("should replace the aggregation name with the series name", () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(
      element,
      [
        MainSeries("bar", {
          series: () => ({ ...DEFAULT_SERIES_SETTINGS, title: "Foo" }),
          series_settings: {
            Sum: { title: "Foo" },
          },
        }),
      ],
      { onHoverChange },
    );

    // hover over each bar
    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");

    const { calls } = onHoverChange.mock;
    expect(getDataKeyValues(calls[0][0])).toEqual([
      { key: "Category", value: "A" },
      { key: "Foo", value: 1 },
    ]);
  });

  it('should render "(empty)" for nulls', () => {
    const onHoverChange = jest.fn();
    renderLineAreaBar(element, [MainSeries("bar", {}, { key: null })], {
      onHoverChange,
    });

    dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");

    const { calls } = onHoverChange.mock;
    const [{ value }] = getDataKeyValues(calls[0][0]);
    expect(value).toEqual("(empty)");

    const tick = element.querySelector(".axis.x .tick text");
    expect(tick).toHaveTextContent("(empty)");
  });

  it(`should render a stacked chart on a logarithmic y scale`, async () => {
    const settings = {
      "stackable.stack_type": "stacked",
      "graph.y_axis.scale": "log",
    };
    renderLineAreaBar(element, [
      MainSeries("bar", settings, { value: 100 }),
      ExtraSeries(1000),
    ]);
    const ticks = qsa(".axis.y .tick text").map(n => n.textContent);
    const lastTickValue = parseInt(ticks[ticks.length - 1]);
    // if there are no ticks above 500, we're incorrectly using only the
    // first series to determine the y axis domain
    expect(lastTickValue > 500).toBe(true);
  });
});

function getDataKeyValues(hover) {
  return hover.data.map(({ key, value }) => ({ key, value }));
}
