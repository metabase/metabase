import "__support__/mocks"; // included explicitly whereas with integrated tests it comes with __support__/integrated_tests

import { formatValue } from "metabase/lib/formatting";

import d3 from "d3";

import {
  NumberColumn,
  DateTimeColumn,
  StringColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  getFormattedTooltips,
} from "../__support__/visualizations";

let formatTz = offset =>
  (offset < 0 ? "-" : "+") + d3.format("02d")(Math.abs(offset)) + ":00";

const BROWSER_TZ = formatTz(-new Date().getTimezoneOffset() / 60);
const ALL_TZS = d3.range(-1, 2).map(formatTz);

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

  ["Z", ...ALL_TZS].forEach(tz =>
    it(
      "should display hourly data (in " +
        tz +
        " timezone) in X axis and tooltip consistently",
      () => {
        const onHoverChange = jest.fn();

        const rows = [
          ["2016-10-03T20:00:00.000" + tz, 1],
          ["2016-10-03T21:00:00.000" + tz, 1],
        ];

        renderTimeseriesLine({
          rowsOfSeries: [rows],
          unit: "hour",
          onHoverChange,
        });

        dispatchUIEvent(qs(".dot"), "mousemove");

        let expected = rows.map(row =>
          formatValue(row[0], {
            column: DateTimeColumn({ unit: "hour" }),
          }),
        );
        expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
          expected[0],
          "1",
        ]);
        expect(qsa(".axis.x .tick text").map(e => e.textContent)).toEqual(
          expected,
        );
      },
    ),
  );

  it("should display hourly data (in the browser's timezone) in X axis and tooltip consistently and correctly", () => {
    const onHoverChange = jest.fn();
    const tz = BROWSER_TZ;
    const rows = [
      ["2016-01-01T01:00:00.000" + tz, 1],
      ["2016-01-01T02:00:00.000" + tz, 1],
      ["2016-01-01T03:00:00.000" + tz, 1],
      ["2016-01-01T04:00:00.000" + tz, 1],
    ];

    renderTimeseriesLine({
      rowsOfSeries: [rows],
      unit: "hour",
      onHoverChange,
    });

    dispatchUIEvent(qs(".dot"), "mousemove");

    expect(
      formatValue(rows[0][0], {
        column: DateTimeColumn({ unit: "hour" }),
      }),
    ).toEqual("January 1, 2016, 1:00 AM");

    expect(getFormattedTooltips(onHoverChange.mock.calls[0][0])).toEqual([
      "January 1, 2016, 1:00 AM",
      "1",
    ]);

    expect(qsa(".axis.x .tick text").map(e => e.textContent)).toEqual([
      "January 1, 2016, 1:00 AM",
      "January 1, 2016, 2:00 AM",
      "January 1, 2016, 3:00 AM",
      "January 1, 2016, 4:00 AM",
    ]);
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
      let rows = [["2016", 1], ["2017", 2]];

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
      let rows = [["2016", 1], ["2017", 2]];

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

  // querySelector shortcut
  const qs = selector => element.querySelector(selector);

  // querySelectorAll shortcut, casts to Array
  const qsa = selector => [...element.querySelectorAll(selector)];

  // helper for timeseries line charts
  const renderTimeseriesLine = ({
    rowsOfSeries,
    onHoverChange,
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
