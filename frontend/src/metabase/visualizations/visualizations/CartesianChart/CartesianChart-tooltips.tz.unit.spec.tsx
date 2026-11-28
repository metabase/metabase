import {
  getTooltipContent,
  hoverChartElement,
  queryShownTooltips,
} from "__support__/echarts-interaction";
import { waitFor } from "__support__/ui";
import { dayjs } from "metabase/dayjs";
import { registerVisualizations } from "metabase/visualizations/register";

import {
  GREEN,
  createDateColumn,
  createMetricColumn,
  createSeries,
  point,
  setupChart,
} from "./tests/test-utils";

registerVisualizations();

const CREATED_AT_MONTH = createDateColumn("CREATED_AT", "month");
const CREATED_AT_WEEK = createDateColumn("CREATED_AT", "week");
const CREATED_AT_DAY = createDateColumn("CREATED_AT", "day");
const SUM_OF_TOTAL = createMetricColumn("sum", "Sum of Total");

/**
 * The backend sends dates in the report time zone. Like e2e tests, which run
 * the browser and the backend in US/Pacific, these use the same time zone for
 * both: the one the tests run in.
 */
const toLocalDate = (date: string) => dayjs(date).format();
const LOCAL_TIMEZONE = dayjs.tz.guess();

// Daylight saving time begins on March 14, 2027 in America/Los_Angeles, one of
// the time zones that CI runs this file in, so each series crosses it
const SUM_OF_TOTAL_BY_MONTH_ACROSS_DST = createSeries({
  resultsTimezone: LOCAL_TIMEZONE,
  cols: [CREATED_AT_MONTH, SUM_OF_TOTAL],
  rows: [
    [toLocalDate("2027-01-01"), 10000],
    [toLocalDate("2027-02-01"), 8911],
    [toLocalDate("2027-03-01"), 9900.12],
    [toLocalDate("2027-04-01"), 9614.01],
    [toLocalDate("2027-05-01"), 9800],
  ],
});

const SUM_OF_TOTAL_BY_WEEK_ACROSS_DST = createSeries({
  resultsTimezone: LOCAL_TIMEZONE,
  cols: [CREATED_AT_WEEK, SUM_OF_TOTAL],
  rows: [
    [toLocalDate("2027-02-28"), 1000],
    [toLocalDate("2027-03-07"), 1273],
    [toLocalDate("2027-03-14"), 1199.17],
    [toLocalDate("2027-03-21"), 1182.86],
    [toLocalDate("2027-03-28"), 1250],
  ],
});

const SUM_OF_TOTAL_BY_DAY_ACROSS_DST = createSeries({
  resultsTimezone: LOCAL_TIMEZONE,
  cols: [CREATED_AT_DAY, SUM_OF_TOTAL],
  rows: [
    [toLocalDate("2027-03-13"), 1000],
    [toLocalDate("2027-03-14"), 1275],
    [toLocalDate("2027-03-15"), 941.46],
    [toLocalDate("2027-03-16"), 1000],
  ],
});

describe("CartesianChart tooltips across a daylight saving time change", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    {
      unit: "month",
      series: SUM_OF_TOTAL_BY_MONTH_ACROSS_DST,
      rows: [
        "10,000",
        "8,911 | -10.89%",
        "9,900.12 | +11.1%",
        "9,614.01 | -2.89%",
      ],
    },
    {
      unit: "week",
      series: SUM_OF_TOTAL_BY_WEEK_ACROSS_DST,
      rows: [
        "1,000",
        "1,273 | +27.3%",
        "1,199.17 | -5.8%",
        "1,182.86 | -1.36%",
      ],
    },
    {
      unit: "day",
      series: SUM_OF_TOTAL_BY_DAY_ACROSS_DST,
      rows: ["1,000", "1,275 | +27.5%", "941.46 | -26.16%"],
    },
  ])(
    "shows the change from the previous $unit across a daylight saving time change",
    async ({ series, rows }) => {
      const chart = await setupChart({ rawSeries: [series] });

      for (const [index, row] of rows.entries()) {
        await hoverChartElement(chart, point(GREEN, index));
        await waitFor(() => {
          const [tooltip] = queryShownTooltips();
          expect(getTooltipContent(tooltip).rows).toEqual([
            `${GREEN} | Sum of Total | ${row}`,
          ]);
        });
      }
    },
  );
});
