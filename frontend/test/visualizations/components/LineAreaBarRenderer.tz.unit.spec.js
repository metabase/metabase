import "__support__/mocks"; // included explicitly whereas with integrated tests it comes with __support__/integrated_tests

import MockDate from "mockdate";
import _ from "underscore";
import moment from "moment-timezone";

import {
  NumberColumn,
  StringColumn,
  DateTimeColumn,
  dispatchUIEvent,
  initFixtureElement,
} from "../__support__/visualizations";

import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";
import { formatValue } from "metabase/lib/formatting";

// make WIDTH big enough that ticks aren't skipped
const WIDTH = 4000;
const HEIGHT = 1000;

describe("LineAreaBarRenderer-bar", () => {
  let element;
  const qsa = selector => [...element.querySelectorAll(selector)];

  // run_timezone_tests sets "TZ" environment variable to change the timezone
  const clientTz = process.env["TZ"] || "[default]";
  // run_timezone_tests also sets "METABASE_TEST_TIMEZONES" to list of timezones
  const reportTzs = (
    process.env["METABASE_TEST_TIMEZONES"] || "America/Los_Angeles"
  ).split(" ");

  // NOTE: for now only run with current time of "now" since the others seem to
  // fail identically. Re-enable if we find frontend bugs that depend on the
  // current time of year.
  [
    null, // now
    // new Date(2016, 0, 1), // 2016-01-01
    // new Date(2016, 5, 1), // 2016-06-01
  ].map(onDate => {
    beforeAll(() => {
      if (onDate) {
        MockDate.set(onDate);
      }
    });
    afterAll(() => {
      MockDate.reset();
    });
    describe(onDate ? `on date ${onDate}` : "now", () => {
      describe(`client timezone ${clientTz}`, () => {
        reportTzs.map(reportTz => {
          describe(`report timezone ${reportTz}`, () => {
            const rows = generateRowsInTz(reportTz);

            sharedTests(rows.slice(0, 2), "points in standard time");
            sharedTests(rows.slice(6, 8), "points in daylights saving time");
            sharedTests(
              rows.slice(2, 4),
              "point starting in standard time, ending in daylights saving time",
            );
            sharedTests(
              rows.slice(10, 12),
              "points starting in daylights saving time, ending in standard time",
            );
            sharedTests(rows, "all points");

            function sharedTests(rows, description) {
              let onHoverChange;

              const getXAxisLabelsText = () =>
                qsa(".axis.x .tick text").map(t => t.textContent);
              const getTooltipDimensionValueText = () =>
                onHoverChange.mock.calls.map(([{ data }]) =>
                  formatValue(data[0].value, {
                    column: data[0].col,
                  }),
                );

              const getSVGElementMiddle = element => {
                return (
                  parseFloat(element.getAttribute("x")) +
                  parseFloat(element.getAttribute("width")) / 2
                );
              };
              const getSVGElementTransformMiddle = element => {
                const transform = element.getAttribute("transform");
                const match = transform.match(/translate\(([0-9\.]+)/);
                return parseFloat(match[1]);
              };

              const getClosestLabelText = bar => {
                // get the horizontal center of the target element
                const barCenter = getSVGElementMiddle(bar);
                let closest;
                let minDelta = Infinity;
                for (const label of qsa(".axis.x .tick")) {
                  const labelCenter = getSVGElementTransformMiddle(label);
                  const delta = Math.abs(barCenter - labelCenter);
                  if (delta < minDelta) {
                    closest = label;
                    minDelta = delta;
                  }
                }
                return closest && closest.textContent;
              };

              describe(description, () => {
                beforeAll(function() {
                  document.body.style.width = `${WIDTH}px`;
                  document.body.style.height = `${HEIGHT}px`;
                  document.body.insertAdjacentHTML(
                    "afterbegin",
                    `<div id="fixture" style="height: ${HEIGHT}px; width: ${WIDTH}px;">`,
                  );
                  element = document.getElementById("fixture");
                  onHoverChange = jest.fn();
                  renderTimeseries(element, "month", rows, { onHoverChange });
                });
                afterAll(function() {
                  document.body.removeChild(element);
                });
                it("should have sequential months in labels", () => {
                  // check that the labels are sequential months
                  assertSequentialMonths(getXAxisLabelsText());
                });
                it("should have sequential months in tooltips", () => {
                  // hover each bar to trigger onHoverChange
                  qsa(".bar").map(bar => dispatchUIEvent(bar, "mousemove"));
                  // check that the resulting tooltips are sequential
                  assertSequentialMonths(getTooltipDimensionValueText());
                  // check that the number of tooltips matches the number of rows
                  expect(getTooltipDimensionValueText().length).toBe(
                    rows.length,
                  );
                });
                it("should have tooltips that match source data", () => {
                  expect(getTooltipDimensionValueText()).toEqual(
                    rows.map(([timestamp]) =>
                      moment.tz(timestamp, reportTz).format("MMMM YYYY"),
                    ),
                  );
                });
                it("should have labels that match tooltips", () => {
                  expect(qsa(".bar").map(getClosestLabelText)).toEqual(
                    getTooltipDimensionValueText(),
                  );
                });
              });
            }
          });
        });
      });
    });
  });
});

const DEFAULT_SETTINGS = {
  "graph.x_axis.scale": "ordinal",
  "graph.y_axis.scale": "linear",
  "graph.x_axis.axis_enabled": true,
  "graph.y_axis.axis_enabled": true,
  "graph.colors": ["#00FF00", "#FF0000"],
};

function renderTimeseries(element, unit, rows, props = {}) {
  lineAreaBarRenderer(element, {
    chartType: "bar",
    series: [
      {
        card: {},
        data: {
          cols: [
            DateTimeColumn({ name: "CREATED_AT", unit }),
            NumberColumn({ name: "count" }),
          ],
          rows,
        },
      },
    ],
    settings: {
      ...DEFAULT_SETTINGS,
      "graph.x_axis.scale": "timeseries",
    },
    ...props,
  });
}

// just hard code these to make sure we don't accidentally generate incorrect month labels
const MONTHS_IN_ORDER = [
  "October 2015",
  "November 2015",
  "December 2015",
  "January 2016",
  "February 2016",
  "March 2016",
  "April 2016",
  "May 2016",
  "June 2016",
  "July 2016",
  "August 2016",
  "September 2016",
  "October 2016",
  "November 2016",
  "December 2016",
  "January 2017",
];

function assertSequentialMonths(months) {
  const firstIndex = MONTHS_IN_ORDER.indexOf(months[0]);
  if (firstIndex < 0 || firstIndex + months.length > MONTHS_IN_ORDER.length) {
    throw new Error(
      "Month out of range! Update MONTHS_IN_ORDER. " +
        months[0] +
        " - " +
        months[months.length - 1],
    );
  }
  expect(months).toEqual(
    MONTHS_IN_ORDER.slice(firstIndex, firstIndex + months.length),
  );
}

function generateRowsInTz(tz) {
  return _.range(0, 12).map(month => [
    moment("2016-01-01")
      .tz(tz)
      .startOf("month")
      .add(month, "months"),
    0,
  ]);
}
