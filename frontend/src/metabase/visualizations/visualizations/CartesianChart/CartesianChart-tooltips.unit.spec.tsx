import {
  expectTooltip,
  getChartElementPoint,
  getTooltipPlacement,
  hoverChartElement,
  queryShownTooltips,
} from "__support__/echarts-interaction";
import { waitFor } from "__support__/ui";
import {
  resetMockExplicitSize,
  setMockExplicitSize,
} from "metabase/common/components/ExplicitSize/tests/mock-size";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationDisplay } from "metabase-types/api";

import {
  BLUE,
  GREEN,
  PURPLE,
  TEAL,
  YELLOW,
  bar,
  createDateColumn,
  createMetricColumn,
  createNativeColumn,
  createSeries,
  point,
  setupChart,
} from "./tests/test-utils";

registerVisualizations();

const CREATED_AT_YEAR = createDateColumn("CREATED_AT", "year");
const CREATED_AT_MONTH = createDateColumn("CREATED_AT", "month");
const SUM_OF_TOTAL = createMetricColumn("sum", "Sum of Total");
const AVG_OF_TOTAL = createMetricColumn("avg", "Average of Total");

// The backend runs in US/Pacific in e2e tests, so dates carry its offset
const YEARS = [
  "2025-01-01T00:00:00-08:00",
  "2026-01-01T00:00:00-08:00",
  "2027-01-01T00:00:00-08:00",
];

const SUM_OF_TOTAL_BY_YEAR = (display: VisualizationDisplay = "line") =>
  createSeries({
    display,
    cols: [CREATED_AT_YEAR, SUM_OF_TOTAL],
    rows: [
      [YEARS[0], 42156.87],
      [YEARS[1], 205256.02],
      [YEARS[2], 351986.79],
    ],
  });

const AVG_OF_TOTAL_BY_YEAR = (display: VisualizationDisplay = "line") =>
  createSeries({
    id: 2,
    name: "Q2",
    display,
    cols: [CREATED_AT_YEAR, AVG_OF_TOTAL],
    rows: [
      [YEARS[0], 56.6649],
      [YEARS[1], 56.8551],
      [YEARS[2], 57.1],
    ],
  });

const AVG_OF_TOTAL_CUM_SUM_QUANTITY_BY_YEAR = createSeries({
  cols: [
    CREATED_AT_YEAR,
    AVG_OF_TOTAL,
    createMetricColumn("sum", "Cumulative sum of Quantity", "type/BigInteger"),
  ],
  rows: [
    [YEARS[0], 56.6649, 3236],
    [YEARS[1], 56.8551, 17587],
    [YEARS[2], 57.1, 35000],
  ],
});

const AVG_DISCOUNT_SUM_DISCOUNT_BY_YEAR = createSeries({
  id: 2,
  name: "Q2",
  cols: [
    CREATED_AT_YEAR,
    createMetricColumn("avg", "Average of Discount"),
    createMetricColumn("sum", "Sum of Discount"),
  ],
  rows: [
    [YEARS[0], 5.03, 342.09],
    [YEARS[1], 5.4091, 1953.08],
    [YEARS[2], 5.6, 3000],
  ],
});

const SUM_OF_TOTAL_BY_MONTH = createSeries({
  cols: [CREATED_AT_MONTH, SUM_OF_TOTAL],
  rows: [
    ["2025-04-01T00:00:00-07:00", 52.7562],
    ["2025-05-01T00:00:00-07:00", 1265.72],
    ["2025-06-01T00:00:00-07:00", 2072.94],
  ],
});

// May and August are missing
const SUM_OF_TOTAL_BY_MONTH_WITH_GAPS = createSeries({
  cols: [CREATED_AT_MONTH, SUM_OF_TOTAL],
  rows: [
    ["2025-04-01T00:00:00-07:00", 52.7562],
    ["2025-06-01T00:00:00-07:00", 2072.94],
    ["2025-07-01T00:00:00-07:00", 3734.69],
    ["2025-09-01T00:00:00-07:00", 5372.08],
    ["2025-10-01T00:00:00-07:00", 6000],
  ],
});

describe("CartesianChart tooltips", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    resetMockExplicitSize();
  });

  describe("percent change", () => {
    it.each([
      { display: "line" as const, target: point },
      { display: "bar" as const, target: bar },
    ])(
      "shows the change from the previous year on a single series $display chart",
      async ({ display, target }) => {
        const chart = await setupChart({
          rawSeries: [SUM_OF_TOTAL_BY_YEAR(display)],
        });

        await hoverChartElement(chart, target(GREEN, 0));
        await expectTooltip({
          header: "2025",
          rows: [`${GREEN} | Sum of Total | 42,156.87`],
        });

        await hoverChartElement(chart, target(GREEN, 1));
        await expectTooltip({
          header: "2026",
          rows: [`${GREEN} | Sum of Total | 205,256.02 | +386.89%`],
        });
      },
    );

    it.each([
      { display: "line" as const, target: point },
      { display: "bar" as const, target: bar },
    ])(
      "shows the change of each series of a $display chart with an added series",
      async ({ display, target }) => {
        const chart = await setupChart({
          rawSeries: [
            SUM_OF_TOTAL_BY_YEAR(display),
            AVG_OF_TOTAL_BY_YEAR(display),
          ],
        });
        const firstYear = {
          header: "2025",
          rows: [`${GREEN} | Q1 | 42,156.87`, `${PURPLE} | Q2 | 56.66`],
        };
        const secondYear = {
          header: "2026",
          rows: [
            `${GREEN} | Q1 | 205,256.02 | +386.89%`,
            `${PURPLE} | Q2 | 56.86 | +0.34%`,
          ],
        };

        await hoverChartElement(chart, target(GREEN, 0));
        await expectTooltip(firstYear);
        await hoverChartElement(chart, target(PURPLE, 1));
        await expectTooltip(secondYear);
        await hoverChartElement(chart, target(PURPLE, 0));
        await expectTooltip(firstYear);
        await hoverChartElement(chart, target(GREEN, 1));
        await expectTooltip(secondYear);
      },
    );

    it("shows the change of every series of a multi-series question", async () => {
      const chart = await setupChart({
        rawSeries: [AVG_OF_TOTAL_CUM_SUM_QUANTITY_BY_YEAR],
      });
      const firstYear = {
        header: "2025",
        rows: [
          `${PURPLE} | Average of Total | 56.66`,
          `${GREEN} | Cumulative sum of Quantity | 3,236`,
        ],
      };
      const secondYear = {
        header: "2026",
        rows: [
          `${PURPLE} | Average of Total | 56.86 | +0.34%`,
          `${GREEN} | Cumulative sum of Quantity | 17,587 | +443.48%`,
        ],
      };

      await hoverChartElement(chart, point(PURPLE, 0));
      await expectTooltip(firstYear);
      await hoverChartElement(chart, point(GREEN, 1));
      await expectTooltip(secondYear);
      await hoverChartElement(chart, point(GREEN, 0));
      await expectTooltip(firstYear);
      await hoverChartElement(chart, point(PURPLE, 1));
      await expectTooltip(secondYear);
    });

    it("shows the change of every series of multi-series questions added to each other", async () => {
      const chart = await setupChart({
        rawSeries: [
          AVG_OF_TOTAL_CUM_SUM_QUANTITY_BY_YEAR,
          AVG_DISCOUNT_SUM_DISCOUNT_BY_YEAR,
        ],
      });
      const firstYear = {
        header: "2025",
        rows: [
          `${PURPLE} | Q1: Average of Total | 56.66`,
          `${GREEN} | Q1: Cumulative sum of Quantity | 3,236`,
          `${BLUE} | Q2: Average of Discount | 5.03`,
          `${TEAL} | Q2: Sum of Discount | 342.09`,
        ],
      };
      const secondYear = {
        header: "2026",
        rows: [
          `${PURPLE} | Q1: Average of Total | 56.86 | +0.34%`,
          `${GREEN} | Q1: Cumulative sum of Quantity | 17,587 | +443.48%`,
          `${BLUE} | Q2: Average of Discount | 5.41 | +7.54%`,
          `${TEAL} | Q2: Sum of Discount | 1,953.08 | +470.93%`,
        ],
      };

      for (const color of [PURPLE, BLUE, TEAL]) {
        await hoverChartElement(chart, point(color, 0));
        await expectTooltip(firstYear);
        await hoverChartElement(chart, point(color, 1));
        await expectTooltip(secondYear);
      }
      await hoverChartElement(chart, point(GREEN, 1));
      await expectTooltip(secondYear);
    });
    it("shows the change from the previous month on a timeseries axis", async () => {
      const chart = await setupChart({ rawSeries: [SUM_OF_TOTAL_BY_MONTH] });

      await hoverChartElement(chart, point(GREEN, 0));
      await expectTooltip({
        header: "April 2025",
        rows: [`${GREEN} | Sum of Total | 52.76`],
      });

      await hoverChartElement(chart, point(GREEN, 1));
      await expectTooltip({
        header: "May 2025",
        rows: [`${GREEN} | Sum of Total | 1,265.72 | +2,299.19%`],
      });
    });

    it("shows no change when the previous month is missing from the results", async () => {
      const chart = await setupChart({
        rawSeries: [SUM_OF_TOTAL_BY_MONTH_WITH_GAPS],
      });

      await hoverChartElement(chart, point(GREEN, 0));
      await expectTooltip({
        header: "April 2025",
        rows: [`${GREEN} | Sum of Total | 52.76`],
      });

      await hoverChartElement(chart, point(GREEN, 1));
      await expectTooltip({
        header: "June 2025",
        rows: [`${GREEN} | Sum of Total | 2,072.94`],
      });

      await hoverChartElement(chart, point(GREEN, 2));
      await expectTooltip({
        header: "July 2025",
        rows: [`${GREEN} | Sum of Total | 3,734.69 | +80.16%`],
      });

      await hoverChartElement(chart, point(GREEN, 3));
      await expectTooltip({
        header: "September 2025",
        rows: [`${GREEN} | Sum of Total | 5,372.08`],
      });
    });

    it("shows no change when the x-axis is not a timeseries", async () => {
      const chart = await setupChart({
        rawSeries: [
          {
            ...SUM_OF_TOTAL_BY_MONTH,
            card: {
              ...SUM_OF_TOTAL_BY_MONTH.card,
              visualization_settings: {
                ...SUM_OF_TOTAL_BY_MONTH.card.visualization_settings,
                "graph.x_axis.scale": "ordinal",
              },
            },
          },
        ],
      });

      await hoverChartElement(chart, point(GREEN, 0));
      await expectTooltip({
        header: "April 2025",
        rows: [`${GREEN} | Sum of Total | 52.76`],
      });

      await hoverChartElement(chart, point(GREEN, 1));
      await expectTooltip({
        header: "May 2025",
        rows: [`${GREEN} | Sum of Total | 1,265.72`],
      });
    });
  });
  it("shows the values and changes of points that fill missing dates with zeros (metabase#47757)", async () => {
    const chart = await setupChart({
      rawSeries: [
        createSeries({
          cols: [
            createNativeColumn("X", "type/Text"),
            createNativeColumn("Y", "type/Integer"),
          ],
          rows: [
            ["2020-01-01", 10],
            ["2020-03-01", 30],
            ["2020-04-01", 40],
          ],
          settings: { series_settings: { Y: { "line.missing": "zero" } } },
        }),
      ],
    });

    await hoverChartElement(chart, point(GREEN, 0));
    await expectTooltip({
      header: "January 2020",
      rows: [`${GREEN} | Y | 10`],
    });

    await hoverChartElement(chart, point(GREEN, 1));
    await expectTooltip({
      header: "February 2020",
      rows: [`${GREEN} | Y | 0 | -100%`],
    });

    await hoverChartElement(chart, point(GREEN, 2));
    await expectTooltip({
      header: "March 2020",
      rows: [`${GREEN} | Y | 30 | +∞%`],
    });
  });

  it("formats the dates of a native question with its time settings (metabase#11435)", async () => {
    const createdAt = createNativeColumn("CREATED_AT", "type/DateTime");
    const chart = await setupChart({
      rawSeries: [
        createSeries({
          cols: [
            createdAt,
            createNativeColumn("ID", "type/BigInteger"),
            createNativeColumn("TOTAL", "type/Float"),
            createNativeColumn("QUANTITY", "type/Integer"),
          ],
          rows: [
            ["2028-03-11T14:10:00.120-08:00", 101, 40.5, 2],
            ["2028-03-11T17:55:36.759-08:00", 102, 135.23, 5],
            ["2028-03-11T20:30:15.001-08:00", 103, 80.01, 3],
          ],
          settings: {
            "graph.dimensions": ["CREATED_AT"],
            "graph.metrics": ["TOTAL"],
            column_settings: {
              '["name","CREATED_AT"]': { time_enabled: "milliseconds" },
            },
          },
        }),
      ],
    });

    await hoverChartElement(chart, point(YELLOW, 1));
    await expectTooltip({
      header: "March 11, 2028, 5:55:36.759 PM",
      rows: [`${YELLOW} | TOTAL | 135.23`],
    });
  });
  it("places the tooltip of a small chart next to the hovered point, not over it", async () => {
    const TOOLTIP_SIZE: [number, number] = [240, 120];
    jest.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1000);
    jest.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(600);
    setMockExplicitSize({ width: 240, height: 180 });
    const chart = await setupChart({
      rawSeries: [
        AVG_OF_TOTAL_CUM_SUM_QUANTITY_BY_YEAR,
        AVG_DISCOUNT_SUM_DISCOUNT_BY_YEAR,
      ],
    });
    await hoverChartElement(chart, point(PURPLE, 0));
    await waitFor(() => expect(queryShownTooltips()).toHaveLength(1));

    const { rect } = getChartElementPoint(chart, point(PURPLE, 0));
    const [left, top] = getTooltipPlacement(
      chart,
      [rect.x + rect.width / 2, rect.y + rect.height / 2],
      TOOLTIP_SIZE,
    );
    const isCovered =
      rect.y < top + TOOLTIP_SIZE[1] &&
      rect.y + rect.height > top &&
      rect.x < left + TOOLTIP_SIZE[0] &&
      rect.x + rect.width > left;

    expect(isCovered).toBe(false);
  });
});
