import "__support__/ui-mocks"; // included explicitly whereas with integrated tests it comes with __support__/integrated_tests

import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import _ from "underscore";

import testAcrossTimezones from "__support__/timezones";
import {
  NumberColumn,
  DateTimeColumn,
  dispatchUIEvent,
  renderLineAreaBar,
  getFormattedTooltips,
} from "__support__/visualizations";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard } from "metabase-types/api/mocks";

registerVisualizations();

// make WIDTH big enough that ticks aren't skipped
const WIDTH = 4000;
const HEIGHT = 1000;

// jsdom doesn't support layout methods like getBBox, so we need to mock it.
window.SVGElement.prototype.getBBox = () => ({
  x: 0,
  y: 0,
  width: WIDTH,
  height: HEIGHT,
});

describe("LineAreaBarRenderer-bar", () => {
  let element;
  let onHoverChange;

  const qsa = selector => [...element.querySelectorAll(selector)];

  function setupFixture() {
    document.body.style.width = `${WIDTH}px`;
    document.body.style.height = `${HEIGHT}px`;
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div id="fixture" style="height: ${HEIGHT}px; width: ${WIDTH}px;">`,
    );
    element = document.getElementById("fixture");
  }

  function teardownFixture() {
    document.body.removeChild(element);
  }

  const activateTooltips = () =>
    qsa(".bar").map(bar => dispatchUIEvent(bar, "mousemove"));

  const getXAxisLabelsText = () =>
    qsa(".axis.x .tick text").map(t => t.textContent);
  const getTooltipDimensionValueText = () =>
    onHoverChange.mock.calls.map(([t]) => getFormattedTooltips(t)[0]);

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

  const MAX_DELTA = 0;

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
    return closest && minDelta <= MAX_DELTA ? closest.textContent : null;
  };

  testAcrossTimezones(reportTz => {
    const rows = generateRowsInTz(reportTz);

    sharedMonthTests(rows.slice(0, 2), "months in standard time");
    sharedMonthTests(rows.slice(6, 8), "months in daylights saving time");
    sharedMonthTests(
      rows.slice(2, 4),
      "months starting in standard time, ending in daylights saving time",
    );
    sharedMonthTests(
      rows.slice(10, 12),
      "months starting in daylights saving time, ending in standard time",
    );
    sharedMonthTests(rows, "all months");

    sharedIntervalTests("hour", "ddd, MMMM D, YYYY, h:mm A");
    sharedIntervalTests("day", "ddd, MMMM D, YYYY");
    // sharedIntervalTests("week", "wo - gggg"); // weeks have differing formats for ticks and tooltips, disable this test for now
    sharedIntervalTests("month", "MMMM YYYY");
    sharedIntervalTests("quarter", "[Q]Q YYYY");
    sharedIntervalTests("year", "YYYY");

    function sharedMonthTests(rows, description) {
      describe(`with ${description}`, () => {
        beforeEach(() => {
          setupFixture();
          onHoverChange = jest.fn();
        });

        afterEach(teardownFixture);

        // eslint-disable-next-line jest/expect-expect
        it("should have sequential months in labels", () => {
          renderTimeseries(element, "month", reportTz, rows, {
            onHoverChange,
          });
          // hover each bar to trigger onHoverChange
          activateTooltips();

          // check that the labels are sequential months
          assertSequentialMonths(getXAxisLabelsText());
        });

        it("should have sequential months in tooltips", () => {
          renderTimeseries(element, "month", reportTz, rows, {
            onHoverChange,
          });
          // hover each bar to trigger onHoverChange
          activateTooltips();

          // check that the resulting tooltips are sequential
          assertSequentialMonths(getTooltipDimensionValueText());
          // check that the number of tooltips matches the number of rows
          expect(getTooltipDimensionValueText().length).toBe(rows.length);
        });

        it("should have tooltips that match source data", () => {
          renderTimeseries(element, "month", reportTz, rows, {
            onHoverChange,
          });
          // hover each bar to trigger onHoverChange
          activateTooltips();

          expect(getTooltipDimensionValueText()).toEqual(
            rows.map(([timestamp]) =>
              moment.tz(timestamp, reportTz).format("MMMM YYYY"),
            ),
          );
        });

        it("should have labels that match tooltips", () => {
          renderTimeseries(element, "month", reportTz, rows, {
            onHoverChange,
          });
          // hover each bar to trigger onHoverChange
          activateTooltips();

          expect(qsa(".bar").map(getClosestLabelText)).toEqual(
            getTooltipDimensionValueText(),
          );
        });
      });
    }

    function sharedIntervalTests(interval, expectedFormat) {
      describe(`with ${interval}s`, () => {
        const rows = [
          [moment().tz(reportTz).startOf(interval).toISOString(true), 1],
          [
            moment()
              .tz(reportTz)
              .startOf(interval)
              .add(1, interval)
              .toISOString(true),
            1,
          ],
        ];

        beforeEach(() => {
          setupFixture();
          onHoverChange = jest.fn();
        });

        afterEach(teardownFixture);

        it("should have tooltips that match source data", () => {
          renderTimeseries(element, interval, reportTz, rows, {
            onHoverChange,
          });
          // hover each bar to trigger onHoverChange
          activateTooltips();

          expect(getTooltipDimensionValueText()).toEqual(
            rows.map(([timestamp]) =>
              moment.tz(timestamp, reportTz).format(expectedFormat),
            ),
          );
        });

        it("should have labels that match tooltips", () => {
          renderTimeseries(element, interval, reportTz, rows, {
            onHoverChange,
          });
          // hover each bar to trigger onHoverChange
          activateTooltips();

          const labels = qsa(".bar").map(getClosestLabelText);
          getTooltipDimensionValueText().map((tooltipValue, index) =>
            expect(tooltipValue).toContain(labels[index]),
          );
        });
      });
    }
  });
});

const DEFAULT_SETTINGS = {
  "graph.x_axis.scale": "timeseries",
  "graph.y_axis.scale": "linear",
  "graph.x_axis.axis_enabled": true,
  "graph.y_axis.axis_enabled": true,
  "graph.colors": ["#00FF00", "#FF0000"],
};

function renderTimeseries(element, unit, timezone, rows, props = {}) {
  const series = [
    {
      card: createMockCard({
        display: "bar",
        visualization_settings: { ...DEFAULT_SETTINGS },
      }),
      data: {
        results_timezone: timezone,
        cols: [
          DateTimeColumn({ name: "CREATED_AT", unit }),
          NumberColumn({ name: "count" }),
        ],
        rows,
      },
    },
  ];
  renderLineAreaBar(element, series, props);
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
      .add(month, "months")
      .toISOString(true),
    0,
  ]);
}
