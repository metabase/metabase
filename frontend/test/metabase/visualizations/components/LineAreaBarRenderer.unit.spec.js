import "__support__/mocks"; // included explicitly whereas with e2e tests it comes with __support__/e2e

import {
  NumberColumn,
  DateTimeColumn,
  StringColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  getFormattedTooltips,
} from "../__support__/visualizations";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import lineAreaBarRenderer, {
  getDimensionsAndGroupsAndUpdateSeriesDisplayNames,
} from "metabase/visualizations/lib/LineAreaBarRenderer";

describe("LineAreaBarRenderer", () => {
  let element;

  beforeEach(function() {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="fixture-parent" style="height: 800px; width: 1200px;"><div id="fixture" /></div>',
    );
    element = document.getElementById("fixture");
  });

  afterEach(function() {
    document.body.removeChild(document.getElementById("fixture-parent"));
  });

  it("should display numeric year in X-axis and tooltip correctly", () => {
    const onHoverChange = jest.fn();
    renderTimeseriesLine({
      rowsOfSeries: [[[2015, 1], [2016, 2], [2017, 3]]],
      unit: "year",
      onHoverChange,
    });
    dispatchUIEvent(qs(".dot"), "mousemove");
    expect(onHoverChange.mock.calls.length).toBe(1);
    expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
      "2015",
      "1",
    ]);
    // Doesn't return the correct ticks in Jest for some reason
    // expect(qsa(".tick text").map(e => e.textContent)).toEqual([
    //     "2015",
    //     "2016",
    //     "2017"
    // ]);
  });

  it("should display a warning for invalid dates", () => {
    const onRender = jest.fn();
    renderTimeseriesLine({
      rowsOfSeries: [[["2019-W52", 1], ["2019-W53", 2], ["2019-W01", 3]]],
      unit: "week",
      onRender,
    });
    const [[{ warnings }]] = onRender.mock.calls;
    expect(warnings).toEqual(['We encountered an invalid date: "2019-W53"']);
  });

  it("should warn if expected timezone doesn't match actual", () => {
    const data = {
      cols: [DateTimeColumn(), NumberColumn()],
      rows: [["2019-01-01", 1]],
      requested_timezone: "US/Pacific",
      results_timezone: "US/Eastern",
    };
    const card = { display: "line", visualization_settings: {} };
    const onRender = jest.fn();

    renderLineAreaBar(element, [{ data, card }], { onRender });

    const [[{ warnings }]] = onRender.mock.calls;
    expect(warnings).toEqual([
      "The query for this chart was run in US/Eastern rather than US/Pacific due to database or driver constraints.",
    ]);
  });

  it("should warn if there are multiple timezones", () => {
    const seriesInTZ = tz => ({
      data: {
        cols: [DateTimeColumn(), NumberColumn()],
        rows: [["2019-01-01", 1]],
        requested_timezone: tz,
        results_timezone: tz,
      },
      card: { display: "line", visualization_settings: {} },
    });
    const onRender = jest.fn();

    renderLineAreaBar(
      element,
      [seriesInTZ("US/Pacific"), seriesInTZ("US/Eastern")],
      { onRender },
    );

    const [[{ warnings }]] = onRender.mock.calls;
    expect(warnings).toEqual([
      "This chart contains queries run in multiple timezones: US/Pacific, US/Eastern",
    ]);
  });

  it("should display weekly ranges in tooltips and months on x axis", () => {
    const rows = [
      ["2020-01-05T00:00:00.000Z", 1],
      ["2020-01-12T00:00:00.000Z", 1],
      ["2020-01-19T00:00:00.000Z", 1],
      ["2020-02-02T00:00:00.000Z", 1],
      ["2020-02-09T00:00:00.000Z", 1],
      ["2020-02-16T00:00:00.000Z", 1],
      ["2020-02-23T00:00:00.000Z", 1],
      ["2020-03-01T00:00:00.000Z", 1],
      ["2020-03-08T00:00:00.000Z", 1],
      ["2020-03-15T00:00:00.000Z", 1],
      ["2020-03-22T00:00:00.000Z", 1],
      ["2020-03-29T00:00:00.000Z", 1],
    ];

    // column settings are cached based on name.
    // we need something unique to not conflict with other tests.
    const dateColumn = DateTimeColumn({
      unit: "week",
      name: Math.random().toString(36),
    });

    const cols = [dateColumn, NumberColumn()];
    const chartType = "line";
    const series = [{ data: { cols, rows }, card: { display: chartType } }];
    const settings = getComputedSettingsForSeries(series);
    const onHoverChange = jest.fn();

    const props = { chartType, series, settings, onHoverChange };
    lineAreaBarRenderer(element, props);

    dispatchUIEvent(qs(".dot"), "mousemove");

    const hover = onHoverChange.mock.calls[0][0];
    const [formattedWeek] = getFormattedTooltips(hover, settings);
    expect(formattedWeek).toEqual("January 5 – 11, 2020");

    const ticks = qsa(".axis.x .tick text").map(e => e.textContent);
    expect(ticks).toEqual([
      "January, 2020",
      "February, 2020",
      "March, 2020",
      "April, 2020",
    ]);
  });

  it("should use column settings for tick formatting and tooltips", () => {
    const rows = [["2016-01-01", 1], ["2016-02-01", 2]];

    // column settings are cached based on name.
    // we need something unique to not conflict with other tests.
    const columnName = Math.random().toString(36);
    const dateColumn = DateTimeColumn({ unit: "month", name: columnName });

    const cols = [dateColumn, NumberColumn()];
    const chartType = "line";
    const column_settings = {
      [`["name","${columnName}"]`]: {
        date_style: "M/D/YYYY",
        date_separator: "-",
      },
    };
    const card = {
      display: chartType,
      visualization_settings: { column_settings },
    };
    const series = [{ data: { cols, rows }, card }];
    const settings = getComputedSettingsForSeries(series);
    const onHoverChange = jest.fn();

    const props = { chartType, series, settings, onHoverChange };
    lineAreaBarRenderer(element, props);

    dispatchUIEvent(qs(".dot"), "mousemove");

    const hover = onHoverChange.mock.calls[0][0];
    const [formattedWeek] = getFormattedTooltips(hover, settings);
    expect(formattedWeek).toEqual("1-2016");

    const ticks = qsa(".axis.x .tick text").map(e => e.textContent);
    expect(ticks).toEqual(["1-2016", "2-2016"]);
  });

  describe("should render correctly a compound line graph", () => {
    const rowsOfNonemptyCard = [[2015, 1], [2016, 2], [2017, 3]];

    it("when only second series is not empty", () => {
      renderTimeseriesLine({
        rowsOfSeries: [[], rowsOfNonemptyCard, [], []],
        unit: "hour",
      });

      // A simple check to ensure that lines are rendered as expected
      expect(qs(".line")).not.toBe(null);
    });

    it("when only first series is not empty", () => {
      renderTimeseriesLine({
        rowsOfSeries: [rowsOfNonemptyCard, [], [], []],
        unit: "hour",
      });

      expect(qs(".line")).not.toBe(null);
    });

    it("when there are many empty and nonempty values ", () => {
      renderTimeseriesLine({
        rowsOfSeries: [
          [],
          rowsOfNonemptyCard,
          [],
          [],
          rowsOfNonemptyCard,
          [],
          rowsOfNonemptyCard,
        ],
        unit: "hour",
      });
      expect(qs(".line")).not.toBe(null);
    });
  });

  describe("should render correctly a compound bar graph", () => {
    it("when only second series is not empty", () => {
      renderScalarBar({
        scalars: [["Non-empty value", null], ["Empty value", 25]],
      });
      expect(qs(".bar")).not.toBe(null);
    });

    it("when only first series is not empty", () => {
      renderScalarBar({
        scalars: [["Non-empty value", 15], ["Empty value", null]],
      });
      expect(qs(".bar")).not.toBe(null);
    });

    it("when there are many empty and nonempty scalars", () => {
      renderScalarBar({
        scalars: [
          ["Empty value", null],
          ["Non-empty value", 15],
          ["2nd empty value", null],
          ["2nd non-empty value", 35],
          ["3rd empty value", null],
          ["4rd empty value", null],
          ["3rd non-empty value", 0],
        ],
      });
      expect(qs(".bar")).not.toBe(null);
    });
  });

  describe("goals", () => {
    it("should render a goal line", () => {
      const rows = [["2016", 1], ["2017", 2]];

      renderTimeseriesLine({
        rowsOfSeries: [rows],
        settings: {
          "graph.show_goal": true,
          "graph.goal_value": 30,
          "graph.goal_label": "Goal",
        },
      });

      expect(qs(".goal .line")).not.toBe(null);
      expect(qs(".goal text")).not.toBe(null);
      expect(qs(".goal text").textContent).toEqual("Goal");
    });

    it("should render a goal tooltip with the proper value", () => {
      const rows = [["2016", 1], ["2017", 2]];

      const goalValue = 30;
      const onHoverChange = jest.fn();
      renderTimeseriesLine({
        rowsOfSeries: [rows],
        settings: {
          "graph.show_goal": true,
          "graph.goal_value": goalValue,
          "graph.goal_label": "Goal",
        },
        onHoverChange,
      });
      dispatchUIEvent(qs(".goal text"), "mouseenter");

      expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
        "30",
      ]);
    });
  });

  describe("histogram", () => {
    it("should have one more tick than it has bars", () => {
      // this is because each bar has a tick on either side
      renderLineAreaBar(
        element,
        [
          {
            data: {
              cols: [NumberColumn(), NumberColumn()],
              rows: [[1, 1], [2, 2], [3, 1]],
            },
            card: {
              display: "bar",
              visualization_settings: {
                "graph.x_axis.axis_enabled": true,
                "graph.x_axis.scale": "histogram",
              },
            },
          },
        ],
        {},
      );
      expect(qsa(".axis.x .tick").length).toBe(4);
    });
  });

  describe("getDimensionsAndGroupsAndUpdateSeriesDisplayNames", () => {
    it("should group a single row", () => {
      const props = { settings: {}, chartType: "bar" };
      const data = [[["a", 1]]];
      const warn = jest.fn();

      const {
        groups,
        dimension,
        yExtents,
      } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, data, warn);

      expect(warn).not.toBeCalled();
      expect(groups[0][0].all()[0]).toEqual({ key: "a", value: 1 });
      expect(dimension.top(1)).toEqual([["a", 1]]);
      expect(yExtents).toEqual([[1, 1]]);
    });

    it("should group multiple series", () => {
      const props = { settings: {}, chartType: "bar" };
      const data = [[["a", 1], ["b", 2]], [["a", 2], ["b", 3]]];
      const warn = jest.fn();

      const {
        groups,
        yExtents,
      } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, data, warn);

      expect(warn).not.toBeCalled();
      expect(groups.length).toEqual(2);
      expect(yExtents).toEqual([[1, 2], [2, 3]]);
    });

    it("should group stacked series", () => {
      const props = {
        settings: { "stackable.stack_type": "stacked" },
        chartType: "bar",
      };
      const data = [[["a", 1], ["b", 2]], [["a", 2], ["b", 3]]];
      const warn = jest.fn();

      const {
        groups,
        yExtents,
      } = getDimensionsAndGroupsAndUpdateSeriesDisplayNames(props, data, warn);

      expect(warn).not.toBeCalled();
      expect(groups.length).toEqual(1);
      expect(yExtents).toEqual([[3, 5]]);
    });
  });
  // querySelector shortcut
  const qs = selector => element.querySelector(selector);

  // querySelectorAll shortcut, casts to Array
  const qsa = selector => [...element.querySelectorAll(selector)];

  // helper for timeseries line charts
  const renderTimeseriesLine = ({
    rowsOfSeries,
    onHoverChange,
    onRender,
    unit,
    settings,
  }) => {
    renderLineAreaBar(
      element,
      rowsOfSeries.map(rows => ({
        data: {
          cols: [DateTimeColumn({ unit }), NumberColumn()],
          rows: rows,
        },
        card: {
          display: "line",
          visualization_settings: {
            "graph.x_axis.scale": "timeseries",
            "graph.x_axis.axis_enabled": true,
            "graph.colors": ["#000000"],
            ...settings,
          },
        },
      })),
      {
        onHoverChange,
        onRender,
      },
    );
  };

  const renderScalarBar = ({ scalars, onHoverChange, unit }) => {
    renderLineAreaBar(
      element,
      scalars.map(scalar => ({
        data: {
          cols: [StringColumn(), NumberColumn()],
          rows: [scalar],
        },
        card: {
          display: "bar",
          visualization_settings: {
            "bar.scalar_series": true,
            "funnel.type": "bar",
            "graph.colors": ["#509ee3", "#9cc177", "#a989c5", "#ef8c8c"],
            "graph.x_axis.axis_enabled": true,
            "graph.x_axis.scale": "ordinal",
          },
        },
      })),
      { onHoverChange },
    );
  };
});
