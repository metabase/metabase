import { color, colors } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { computeChange } from "metabase/visualizations/lib/numeric";
import {
  CHANGE_ARROW_ICONS,
  computeTrend as _computeTrend,
  CHANGE_TYPE_OPTIONS,
} from "metabase/visualizations/visualizations/SmartScalar/compute";
import {
  createMockColumn,
  createMockNativeDatasetQuery,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { COMPARISON_TYPES } from "./constants";
import { formatChange } from "./utils";

const computeTrend = (...args) =>
  _computeTrend(...args, { formatValue, getColor: color });

describe("SmartScalar > compute", () => {
  describe("computeTrend", () => {
    const series = ({ rows, cols, queryType }) => {
      if (queryType === "native") {
        return [
          createMockSingleSeries(
            { dataset_query: createMockNativeDatasetQuery() },
            { data: { rows, cols } },
          ),
        ];
      }

      return [createMockSingleSeries({}, { data: { rows, cols } })];
    };

    describe("change types", () => {
      const comparisonType = COMPARISON_TYPES.PREVIOUS_VALUE;
      const getComparisonProperties =
        createGetComparisonProperties(comparisonType);
      const settings = createMockVisualizationSettings({
        "scalar.field": "Count",
        "scalar.comparisons": [{ id: "1", type: comparisonType }],
      });

      const cols = [
        createMockDateTimeColumn({ name: "Month" }),
        createMockNumberColumn({ name: "Count" }),
      ];

      const testCases = [
        {
          description: "should correctly display percent increase",
          rows: [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 300 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "increase",
                comparisonValue: 100,
                dateStr: "Oct",
                metricValue: 300,
              }),
            },
          },
        },
        {
          description: "should correctly display percent decrease",
          rows: [
            ["2019-10-01", 300],
            ["2019-11-01", 100],
          ],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 100 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "decrease",
                comparisonValue: 300,
                dateStr: "Oct",
                metricValue: 100,
              }),
            },
          },
        },
        {
          description: "should correctly display positive infinite increase",
          rows: [
            ["2019-10-01", 0],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 300 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "increase",
                comparisonValue: 0,
                dateStr: "Oct",
                metricValue: 300,
              }),
            },
          },
        },
        {
          description: "should correctly display negative infinite decrease",
          rows: [
            ["2019-10-01", 0],
            ["2019-11-01", -300],
          ],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: -300 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "decrease",
                comparisonValue: 0,
                dateStr: "Oct",
                metricValue: -300,
              }),
            },
          },
        },
        {
          description: "should correctly display no change",
          rows: [
            ["2019-10-01", 100],
            ["2019-11-01", 100],
          ],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 100 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "no change",
                comparisonValue: 100,
                dateStr: "Oct",
                metricValue: 100,
              }),
            },
          },
        },
        {
          description:
            "should correctly display missing data if previous value is null",
          rows: [
            ["2019-09-01", null],
            ["2019-11-01", 300],
          ],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 300 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "missing",
              }),
            },
          },
        },
        {
          description:
            "should correctly display missing data for no previous rows",
          rows: [["2019-11-01", 300]],
          dateUnit: "month",
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 300 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "missing",
              }),
            },
          },
        },
      ];

      it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
        const insights = [{ unit: dateUnit, col: "Count" }];
        const { trend } = computeTrend(
          series({ rows, cols }),
          insights,
          settings,
        );
        expect(getTrend(trend)).toEqual(expected);
      });
    });

    describe("comparison types", () => {
      describe(`comparisonType: ${COMPARISON_TYPES.PREVIOUS_VALUE}`, () => {
        const comparisonType = COMPARISON_TYPES.PREVIOUS_VALUE;
        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);
        const settings = createMockVisualizationSettings({
          "scalar.field": "Count",
          "scalar.comparisons": [{ id: "1", type: comparisonType }],
        });

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        const testCases = [
          {
            description:
              "should correctly display percent decrease over missing row",
            rows: [
              ["2019-09-01", 300],
              ["2019-11-01", 100],
            ],
            dateUnit: "month",
            expected: {
              ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 100 }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "decrease",
                  comparisonValue: 300,
                  dateStr: "Sep",
                  metricValue: 100,
                }),
              },
            },
          },
          {
            description:
              "should correctly display percent decrease over null row data",
            rows: [
              ["2019-09-01", 300],
              ["2019-10-01", null],
              ["2019-11-01", 100],
            ],
            dateUnit: "month",
            expected: {
              ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 100 }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "decrease",
                  comparisonValue: 300,
                  dateStr: "Sep",
                  metricValue: 100,
                }),
              },
            },
          },
          {
            description: "should handle no previous value to compare to",
            rows: [["2019-11-01", 100]],
            dateUnit: "month",
            expected: {
              ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 100 }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "missing",
                }),
              },
            },
          },
        ];

        it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
          const insights = [{ unit: dateUnit, col: "Count" }];
          const { trend } = computeTrend(
            series({ rows, cols }),
            insights,
            settings,
          );

          expect(getTrend(trend)).toEqual(expected);
        });
      });

      describe(`comparisonType: ${COMPARISON_TYPES.PREVIOUS_PERIOD}`, () => {
        const comparisonType = COMPARISON_TYPES.PREVIOUS_PERIOD;
        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);
        const settings = createMockVisualizationSettings({
          "scalar.field": "Count",
          "scalar.comparisons": [{ id: "1", type: comparisonType }],
        });

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        const testCases = [
          {
            description: "should correctly display previous year comparison",
            rows: [
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            expected: {
              ...getMetricProperties({ dateStr: "2019", metricValue: 300 }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous year",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should correctly display previous quarter comparison",
            rows: [
              ["2024-07-01T00:00:00", 100],
              ["2024-10-01T00:00:00", 300],
            ],
            dateUnit: "quarter",
            expected: {
              ...getMetricProperties({
                dateStr: "Q4 2024",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous quarter",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should correctly display previous month comparison",
            rows: [
              ["2018-12-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "month",
            expected: {
              ...getMetricProperties({
                dateStr: "Jan 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous month",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should correctly display previous week comparison",
            rows: [
              ["2019-01-01", 100],
              ["2019-01-08", 300],
            ],
            dateUnit: "week",
            expected: {
              ...getMetricProperties({
                dateStr: "Jan 8–14, 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous week",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should correctly display previous day comparison",
            rows: [
              ["2019-01-01", 100],
              ["2019-01-02", 300],
            ],
            dateUnit: "day",
            expected: {
              ...getMetricProperties({
                dateStr: "Jan 2, 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous day",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should correctly display previous hour comparison",
            rows: [
              ["2019-01-02T09:00", 100],
              ["2019-01-02T10:00", 300],
            ],
            dateUnit: "hour",
            expected: {
              ...getMetricProperties({
                dateStr: "Jan 2, 2019, 10:00–59 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous hour",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should correctly display previous minute comparison",
            rows: [
              ["2019-01-02T09:59", 100],
              ["2019-01-02T10:00", 300],
            ],
            dateUnit: "minute",
            expected: {
              ...getMetricProperties({
                dateStr: "Jan 2, 2019, 10:00 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous minute",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should correctly display N/A if missing previous period",
            rows: [
              ["2017-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "missing",
                  dateStr: "previous year",
                }),
              },
            },
          },
        ];

        it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
          const insights = [{ unit: dateUnit, col: "Count" }];
          const { trend } = computeTrend(
            series({ rows, cols }),
            insights,
            settings,
          );
          expect(getTrend(trend)).toEqual(expected);
        });

        describe(`invalid options`, () => {
          const comparisonType = COMPARISON_TYPES.PREVIOUS_PERIOD;
          const settings = createMockVisualizationSettings({
            "scalar.field": "Count",
            "scalar.comparisons": [{ id: "1", type: comparisonType }],
          });

          const cols = [
            createMockDateTimeColumn({ name: "Month" }),
            createMockNumberColumn({ name: "Count" }),
          ];

          const testCases = [
            {
              description: "should handle no dateUnit supplied",
              rows: [
                ["2017-01-01", 10],
                ["2018-01-01", 100],
                ["2019-01-01", 300],
              ],
              dateUnit: null,
              error: "No date unit supplied for periods ago comparison.",
            },
          ];

          it.each(testCases)("$description", ({ rows, dateUnit, error }) => {
            const insights = [{ unit: dateUnit, col: "Count" }];
            const { error: computeTrendError } = computeTrend(
              series({ rows, cols }),
              insights,
              settings,
            );

            expect(computeTrendError.message).toEqual(error);
          });
        });
      });

      describe(`comparisonType: ${COMPARISON_TYPES.PERIODS_AGO}`, () => {
        const comparisonType = COMPARISON_TYPES.PERIODS_AGO;
        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);
        const createSettings = value =>
          createMockVisualizationSettings({
            "scalar.field": "Count",
            "scalar.comparisons": [{ id: "1", type: comparisonType, value }],
          });

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        const testCases = [
          {
            description: "should handle comparisons by years",
            rows: [
              ["2017-01-01", 10],
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            periodsAgo: 2,
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 10,
                  dateStr: "2017",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle comparisons by quarters",
            rows: [
              ["2023-07-01T00:00:00", 100],
              ["2024-10-01T00:00:00", 300],
            ],
            dateUnit: "quarter",
            periodsAgo: 5,
            expected: {
              ...getMetricProperties({
                dateStr: "Q4 2024",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Q3 2023",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle comparisons by months",
            rows: [
              ["2022-06-01", 100],
              ["2022-12-01", 300],
            ],
            dateUnit: "month",
            periodsAgo: 6,
            expected: {
              ...getMetricProperties({
                dateStr: "Dec 2022",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Jun",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle comparisons by weeks",
            rows: [
              ["2022-11-10", 100],
              ["2022-12-01", 300],
            ],
            dateUnit: "week",
            periodsAgo: 3,
            expected: {
              ...getMetricProperties({
                dateStr: "Dec 1–7, 2022",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Nov 10–16",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle comparisons by days",
            rows: [
              ["2022-08-31", 100],
              ["2022-09-10", 300],
            ],
            dateUnit: "day",
            periodsAgo: 10,
            expected: {
              ...getMetricProperties({
                dateStr: "Sep 10, 2022",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Aug 31",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle comparisons by hours",
            rows: [
              ["2022-12-01T07:00", 100],
              ["2022-12-01T10:00", 300],
            ],
            dateUnit: "hour",
            periodsAgo: 3,
            expected: {
              ...getMetricProperties({
                dateStr: "Dec 1, 2022, 10:00–59 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "7:00–59 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle comparisons by minutes",
            rows: [
              ["2022-12-01T10:15", 100],
              ["2022-12-01T10:30", 300],
            ],
            dateUnit: "minute",
            periodsAgo: 15,
            expected: {
              ...getMetricProperties({
                dateStr: "Dec 1, 2022, 10:30 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "10:15 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle in-range missing comparison",
            rows: [
              ["2016-01-01", 10],
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            periodsAgo: 2,
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "missing",
                  dateStr: "2017",
                }),
              },
            },
          },
          {
            description: "should handle out-of-range missing comparison",
            rows: [
              ["2016-01-01", 10],
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            periodsAgo: 5,
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "missing",
                  dateStr: "2014",
                }),
              },
            },
          },
          {
            description: "should handle 1 period ago comparison",
            rows: [
              ["2017-01-01", 10],
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            periodsAgo: 1,
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "previous year",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should handle 0 periods ago comparison",
            rows: [
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            periodsAgo: 0,
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "missing",
                  dateStr: "2019",
                }),
              },
            },
          },
          {
            description: "should handle negative periods ago comparison",
            rows: [
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            periodsAgo: -1,
            expected: {
              ...getMetricProperties({
                dateStr: "2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "missing",
                  dateStr: "2020",
                }),
              },
            },
          },
        ];

        it.each(testCases)(
          "$description",
          ({ rows, expected, dateUnit, periodsAgo }) => {
            const insights = [{ unit: dateUnit, col: "Count" }];
            const { trend } = computeTrend(
              series({ rows, cols }),
              insights,
              createSettings(periodsAgo),
            );

            expect(getTrend(trend)).toEqual(expected);
          },
        );

        describe(`invalid options`, () => {
          const comparisonType = COMPARISON_TYPES.PERIODS_AGO;
          const createSettings = value =>
            createMockVisualizationSettings({
              "scalar.field": "Count",
              "scalar.comparisons": [{ id: "1", type: comparisonType, value }],
            });

          const cols = [
            createMockDateTimeColumn({ name: "Month" }),
            createMockNumberColumn({ name: "Count" }),
          ];

          const testCases = [
            {
              description: "should handle no non-null values",
              rows: [
                ["2017-01-01", null],
                ["2018-01-01", null],
                ["2019-01-01", null],
              ],
              dateUnit: "year",
              periodsAgo: 1,
              error: "No rows contain a valid value.",
            },
            {
              description: "should handle no dateUnit supplied",
              rows: [
                ["2017-01-01", 10],
                ["2018-01-01", 100],
                ["2019-01-01", 300],
              ],
              dateUnit: null,
              periodsAgo: 1,
              error: "No date unit supplied for periods ago comparison.",
            },
            {
              description: "should handle periodsAgo as a string",
              rows: [
                ["2017-01-01", 10],
                ["2018-01-01", 100],
                ["2019-01-01", 300],
              ],
              dateUnit: "year",
              periodsAgo: "string",
              error: "No integer value supplied for periods ago comparison.",
            },
            {
              description: "should handle periodsAgo as a float",
              rows: [
                ["2017-01-01", 10],
                ["2018-01-01", 100],
                ["2019-01-01", 300],
              ],
              dateUnit: "year",
              periodsAgo: 5.39,
              error: "No integer value supplied for periods ago comparison.",
            },
            {
              description: "should handle missing periodsAgo value",
              rows: [
                ["2017-01-01", 10],
                ["2018-01-01", 100],
                ["2019-01-01", 300],
              ],
              dateUnit: "year",
              periodsAgo: null,
              error: "No integer value supplied for periods ago comparison.",
            },
          ];

          it.each(testCases)(
            "$description",
            ({ rows, dateUnit, periodsAgo, error }) => {
              const insights = [{ unit: dateUnit, col: "Count" }];

              const { error: computeTrendError } = computeTrend(
                series({ rows, cols }),
                insights,
                createSettings(periodsAgo),
              );

              expect(computeTrendError.message).toEqual(error);
            },
          );
        });
      });

      describe(`comparison type: ${COMPARISON_TYPES.STATIC_NUMBER}`, () => {
        const comparisonType = COMPARISON_TYPES.STATIC_NUMBER;

        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);

        const createSettings = ({ label, value }) => ({
          "scalar.field": "Count",
          "scalar.comparisons": [
            { id: "1", type: comparisonType, label, value },
          ],
        });

        const createExpectedTrendObject = ({ changeType, label, value }) => ({
          value,
          comparison: {
            ...getComparisonProperties({
              changeType,
              comparisonValue: value,
              metricValue: 300,
            }),
            comparisonDescStr: `vs. ${label}`,
          },
          ...getMetricProperties({
            dateStr: "2019",
            metricValue: 300,
          }),
        });

        const insights = [{ unit: "year", col: "Count" }];

        const rows = [
          ["2016-01-01", 100],
          ["2018-01-01", 200],
          ["2019-01-01", 300],
        ];

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        const testCases = [
          {
            description: "should correctly display increase",
            value: 200,
            label: "Goal",
            expected: createExpectedTrendObject({
              changeType: "increase",
              value: 200,
              label: "Goal",
            }),
          },
          {
            description: "should correctly display decrease",
            value: 400,
            label: "Bigger Goal",
            expected: createExpectedTrendObject({
              changeType: "decrease",
              value: 400,
              label: "Bigger Goal",
            }),
          },
          {
            description: "should correctly display no change",
            value: 300,
            label: "Goal",
            expected: createExpectedTrendObject({
              changeType: "no change",
              value: 300,
              label: "Goal",
            }),
          },
          {
            description: "should handle negative values",
            value: -300,
            label: "Pessimistic Goal",
            expected: createExpectedTrendObject({
              changeType: "increase",
              value: -300,
              label: "Pessimistic Goal",
            }),
          },
          {
            description: "should handle zero values",
            value: 0,
            label: "Magical Goal",
            expected: createExpectedTrendObject({
              changeType: "increase",
              value: 0,
              label: "Magical Goal",
            }),
          },
          {
            description: "should handle float values",
            value: 16.2,
            label: "Goal",
            expected: createExpectedTrendObject({
              changeType: "increase",
              value: 16.2,
              label: "Goal",
            }),
          },
        ];

        it.each(testCases)("$description", ({ label, value, expected }) => {
          const { trend } = computeTrend(
            series({ rows, cols }),
            insights,
            createSettings({ label, value }),
          );
          expect(getTrend(trend)).toEqual(expected);
        });
      });

      describe(`comparison type: ${COMPARISON_TYPES.ANOTHER_COLUMN}`, () => {
        const comparisonType = COMPARISON_TYPES.ANOTHER_COLUMN;

        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);

        const createSettings = ({ column = "Average", label = column }) => ({
          "scalar.field": "Count",
          "scalar.comparisons": [
            { id: "1", type: comparisonType, label, column },
          ],
        });

        const insights = [{ unit: "year", col: "Count" }];

        const monthColumn = createMockDateTimeColumn({ name: "Month" });
        const countColumn = createMockNumberColumn({ name: "Count" });
        const averageColumn = createMockNumberColumn({ name: "Average" });

        const createExpectedTrendObject = ({
          changeType,
          primaryValue,
          comparisonValue,
          comparisonColumnLabel,
        }) => ({
          value: primaryValue,
          comparison: {
            ...getComparisonProperties({
              changeType,
              comparisonValue: comparisonValue,
              metricValue: primaryValue,
            }),
            comparisonDescStr: `vs. ${comparisonColumnLabel}`,
          },
          ...getMetricProperties({
            dateStr: "2019",
            metricValue: primaryValue,
          }),
        });

        const testCases = [
          {
            description: "should correctly display increase",
            rows: [["2019-01-01", 200, 150]],
            cols: [monthColumn, countColumn, averageColumn],
            expected: createExpectedTrendObject({
              changeType: "increase",
              primaryValue: 200,
              comparisonValue: 150,
              comparisonColumnLabel: "Average",
            }),
          },
          {
            description: "should correctly display decrease",
            rows: [["2019-01-01", 125, 190]],
            cols: [monthColumn, countColumn, averageColumn],
            expected: createExpectedTrendObject({
              changeType: "decrease",
              primaryValue: 125,
              comparisonValue: 190,
              comparisonColumnLabel: "Average",
            }),
          },
          {
            description: "should correctly display no change",
            rows: [["2019-01-01", 300, 300]],
            cols: [monthColumn, countColumn, averageColumn],
            expected: createExpectedTrendObject({
              changeType: "no change",
              primaryValue: 300,
              comparisonValue: 300,
              comparisonColumnLabel: "Average",
            }),
          },
          {
            description: "should handle a missing column",
            rows: [["2019-01-01", 300]],
            cols: [monthColumn, countColumn],
            expected: createExpectedTrendObject({
              changeType: "missing",
              primaryValue: 300,
              comparisonValue: undefined,
              comparisonColumnLabel: "N/A",
            }),
          },
        ];

        it.each(testCases)("$description", ({ rows, cols, expected }) => {
          const { trend } = computeTrend(
            series({ rows, cols }),
            insights,
            createSettings({ column: "Average" }),
          );
          expect(getTrend(trend)).toEqual(expected);
        });
      });

      describe(`invalid comparison type`, () => {
        const createSettings = type =>
          createMockVisualizationSettings({
            "scalar.field": "Count",
            "scalar.comparisons": [{ id: "1", type }],
          });

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        const testCases = [
          {
            description: "should handle no comparison type specified",
            rows: [
              ["2016-01-01", 10],
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            type: undefined,
          },
          {
            description: "should handle invalid comparison type specified",
            rows: [
              ["2016-01-01", 10],
              ["2018-01-01", 100],
              ["2019-01-01", 300],
            ],
            dateUnit: "year",
            type: "whatever you feel like",
          },
        ];

        it.each(testCases)("$description", ({ rows, dateUnit, type }) => {
          const insights = [{ unit: dateUnit, col: "Count" }];

          const { error: computeTrendError } = computeTrend(
            series({ rows, cols }),
            insights,
            createSettings(type),
          );

          expect(computeTrendError.message).toEqual(
            "Invalid comparison type specified.",
          );
        });
      });
    });

    describe("dates", () => {
      describe("dateUnit", () => {
        const comparisonType = COMPARISON_TYPES.PREVIOUS_VALUE;
        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);
        const settings = createMockVisualizationSettings({
          "scalar.field": "Count",
          "scalar.comparisons": [{ id: "1", type: comparisonType }],
        });

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        const testCases = [
          {
            description:
              "should not remove year when previous quarter and current quarter are different years",
            rows: [
              ["2023-10-01T00:00:00", 100],
              ["2024-10-01T00:00:00", 300],
            ],
            dateUnit: "quarter",
            expected: {
              ...getMetricProperties({
                dateStr: "Q4 2024",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Q4 2023",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year when previous quarter and current quarter are within the same year",
            rows: [
              ["2024-04-01T00:00:00", 100],
              ["2024-10-01T00:00:00", 300],
            ],
            dateUnit: "quarter",
            expected: {
              ...getMetricProperties({
                dateStr: "Q4 2024",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Q2",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should not remove year when previous month and current month are in different years",
            rows: [
              ["2018-09-01", 100],
              ["2019-11-01", 300],
            ],
            dateUnit: "month",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Sep 2018",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year when previous month and current month are within the same year",
            rows: [
              ["2019-09-01", 100],
              ["2019-11-01", 300],
            ],
            dateUnit: "month",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Sep",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should not remove year when previous week and current week are in different years",
            rows: [
              ["2022-11-06", 100],
              ["2023-11-19", 300],
            ],
            dateUnit: "week",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 19–25, 2023",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Nov 6–12, 2022",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year when previous week and current week are within the same year",
            rows: [
              ["2023-11-05", 100],
              ["2023-11-19", 300],
            ],
            dateUnit: "week",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 19–25, 2023",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Nov 5–11",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should not remove year when previous day and current day are in different years",
            rows: [
              ["2018-10-01", 100],
              ["2019-11-05", 300],
            ],
            dateUnit: "day",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Oct 1, 2018",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year when previous day and current day are within the same year",
            rows: [
              ["2019-10-10", 100],
              ["2019-11-05", 300],
            ],
            dateUnit: "day",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Oct 10",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should not remove year when previous hour and current hour are in different years",
            rows: [
              ["2018-11-05T04:00:00", 100],
              ["2019-11-05T04:00:00", 300],
            ],
            dateUnit: "hour",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019, 4:00–59 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Nov 5, 2018, 4:00–59 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year when previous hour and current hour are in the same year",
            rows: [
              ["2019-10-30T04:00:00", 100],
              ["2019-11-05T04:00:00", 300],
            ],
            dateUnit: "hour",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019, 4:00–59 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Oct 30, 4:00–59 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year and day when previous hour and current hour are in the same day",
            rows: [
              ["2019-11-05T04:00:00", 100],
              ["2019-11-05T10:00:00", 300],
            ],
            dateUnit: "hour",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019, 10:00–59 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "4:00–59 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should not remove year when previous minute and current minute are in different years",
            rows: [
              ["2018-10-10T04:00:00", 100],
              ["2019-11-05T04:00:00", 300],
            ],
            dateUnit: "minute",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019, 4:00 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Oct 10, 2018, 4:00 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year when previous minute and current minute are in the same year",
            rows: [
              ["2019-10-10T04:00:00", 100],
              ["2019-11-05T04:00:00", 300],
            ],
            dateUnit: "minute",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019, 4:00 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "Oct 10, 4:00 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description:
              "should remove year and day when previous minute and current minute are in the same day",
            rows: [
              ["2019-11-05T04:00:00", 100],
              ["2019-11-05T10:00:00", 300],
            ],
            dateUnit: "minute",
            expected: {
              ...getMetricProperties({
                dateStr: "Nov 5, 2019, 10:00 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "4:00 AM",
                  metricValue: 300,
                }),
              },
            },
          },
          {
            description: "should display full date if no dateUnit is supplied",
            rows: [
              ["2018-09-01T06:00", 100],
              ["2019-11-01T07:50", 300],
            ],
            dateUnit: null,
            expected: {
              ...getMetricProperties({
                dateStr: "November 1, 2019, 7:50 AM",
                metricValue: 300,
              }),
              comparison: {
                ...getComparisonProperties({
                  changeType: "increase",
                  comparisonValue: 100,
                  dateStr: "September 1, 2018, 6:00 AM",
                  metricValue: 300,
                }),
              },
            },
          },
        ];

        it.each(testCases)("$description", ({ rows, expected, dateUnit }) => {
          const insights = [{ unit: dateUnit, col: "Count" }];
          const { trend } = computeTrend(
            series({ rows, cols }),
            insights,
            settings,
          );

          expect(getTrend(trend)).toEqual(expected);
        });
      });

      describe("with time-zones", () => {
        const comparisonType = COMPARISON_TYPES.PERIODS_AGO;
        const getComparisonProperties =
          createGetComparisonProperties(comparisonType);
        const createSettings = value =>
          createMockVisualizationSettings({
            "scalar.field": "Count",
            "scalar.comparisons": [{ id: "1", type: comparisonType, value }],
          });

        const cols = [
          createMockDateTimeColumn({ name: "Month" }),
          createMockNumberColumn({ name: "Count" }),
        ];

        describe("should handle dates with same time-zones", () => {
          const testCases = [
            {
              description: "should handle comparisons by quarters",
              rows: [
                ["2024-01-01T00:00:00-04:00", 100],
                ["2024-10-01T00:00:00-04:00", 300],
              ],
              dateUnit: "quarter",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Q4 2024",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "increase",
                    comparisonValue: 100,
                    dateStr: "Q1",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by months",
              rows: [
                ["2023-01-01T00:00:00-04:00", 100],
                ["2023-04-01T00:00:00-04:00", 300],
              ],
              dateUnit: "month",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Apr 2023",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "increase",
                    comparisonValue: 100,
                    dateStr: "Jan",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by weeks",
              rows: [
                ["2022-11-10T00:00-04:00", 100],
                ["2022-12-01T00:00-04:00", 300],
              ],
              dateUnit: "week",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Dec 1–7, 2022",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "increase",
                    comparisonValue: 100,
                    dateStr: "Nov 10–16",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by days",
              rows: [
                ["2022-12-01T00:00:00-04:00", 100],
                ["2022-12-04T00:00:00-04:00", 300],
              ],
              dateUnit: "day",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Dec 4, 2022",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "increase",
                    comparisonValue: 100,
                    dateStr: "Dec 1",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by hours",
              rows: [
                ["2022-12-01T07:00:00-04:00", 100],
                ["2022-12-01T10:00:00-04:00", 300],
              ],
              dateUnit: "hour",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Dec 1, 2022, 10:00–59 AM",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "increase",
                    comparisonValue: 100,
                    dateStr: "7:00–59 AM",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by minutes",
              rows: [
                ["2022-12-01T10:15:00-04:00", 100],
                ["2022-12-01T10:30:00-04:00", 300],
              ],
              dateUnit: "minute",
              periodsAgo: 15,
              expected: {
                ...getMetricProperties({
                  dateStr: "Dec 1, 2022, 10:30 AM",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "increase",
                    comparisonValue: 100,
                    dateStr: "10:15 AM",
                    metricValue: 300,
                  }),
                },
              },
            },
          ];

          it.each(testCases)(
            "$description",
            ({ rows, expected, dateUnit, periodsAgo }) => {
              const insights = [{ unit: dateUnit, col: "Count" }];
              const { trend } = computeTrend(
                series({ rows, cols }),
                insights,
                createSettings(periodsAgo),
              );

              expect(getTrend(trend)).toEqual(expected);
            },
          );
        });

        // if the date time column has a mix of time-zones - most likely due to
        // daylight savings time - we want to make sure that the time-zone offsets
        // do not affect previousPeriod and periodsAgo comparisons
        // see SmartScalar/compute.js -> areDatesTheSame function for more info
        describe("should handle dates with differing time-zones", () => {
          const testCases = [
            {
              description: "should handle comparisons by quarters",
              rows: [
                ["2023-10-01T00:00:00-05:00", 100],
                ["2024-01-01T00:00:00-04:00", null],
                ["2024-10-01T00:00:00-04:00", 300],
              ],
              dateUnit: "quarter",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Q4 2024",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "missing",
                    dateStr: "Q1",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by months",
              rows: [
                ["2022-12-01T00:00:00-05:00", 100],
                ["2023-01-01T00:00:00-04:00", null],
                ["2023-04-01T00:00:00-04:00", 300],
              ],
              dateUnit: "month",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Apr 2023",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "missing",
                    dateStr: "Jan",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by weeks",
              rows: [
                ["2022-11-03T00:00-05:00", 100],
                ["2022-11-10T00:00-04:00", null],
                ["2022-12-01T00:00-04:00", 300],
              ],
              dateUnit: "week",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Dec 1–7, 2022",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "missing",
                    dateStr: "Nov 10–16",
                    metricValue: 300,
                  }),
                },
              },
            },
            {
              description: "should handle comparisons by days",
              rows: [
                ["2022-12-01T00:00:00-05:00", 100],
                ["2022-12-02T00:00:00-04:00", null],
                ["2022-12-05T00:00:00-04:00", 300],
              ],
              dateUnit: "day",
              periodsAgo: 3,
              expected: {
                ...getMetricProperties({
                  dateStr: "Dec 5, 2022",
                  metricValue: 300,
                }),
                comparison: {
                  ...getComparisonProperties({
                    changeType: "missing",
                    dateStr: "Dec 2",
                    metricValue: 300,
                  }),
                },
              },
            },
          ];

          it.each(testCases)(
            "$description",
            ({ rows, expected, dateUnit, periodsAgo }) => {
              const insights = [{ unit: dateUnit, col: "Count" }];
              const { trend } = computeTrend(
                series({ rows, cols }),
                insights,
                createSettings(periodsAgo),
              );

              expect(getTrend(trend)).toEqual(expected);
            },
          );
        });
      });
    });

    describe("field selection", () => {
      const comparisonType = COMPARISON_TYPES.PREVIOUS_VALUE;
      const getComparisonProperties =
        createGetComparisonProperties(comparisonType);
      const createSettings = field =>
        createMockVisualizationSettings({
          "scalar.field": field,
          "scalar.comparisons": [{ id: "1", type: comparisonType }],
        });

      const COUNT_FIELD = "Count";
      const SUM_FIELD = "Sum";

      const cols = [
        createMockDateTimeColumn({ name: "Month" }),
        createMockNumberColumn({ name: COUNT_FIELD }),
        createMockNumberColumn({ name: SUM_FIELD }),
      ];

      const testCases = [
        {
          description: "should correctly use field setting Count",
          rows: [
            ["2019-10-01", 100, 958469],
            ["2019-11-01", 300, 920000],
          ],
          dateUnit: "month",
          field: COUNT_FIELD,
          expected: {
            ...getMetricProperties({ dateStr: "Nov 2019", metricValue: 300 }),
            comparison: {
              ...getComparisonProperties({
                changeType: "increase",
                comparisonValue: 100,
                dateStr: "Oct",
                metricValue: 300,
              }),
            },
          },
        },
        {
          description: "should correctly use field setting Sum",
          rows: [
            ["2019-10-01", 100, 958469],
            ["2019-11-01", 300, 920000],
          ],
          dateUnit: "month",
          field: SUM_FIELD,
          expected: {
            ...getMetricProperties({
              dateStr: "Nov 2019",
              metricValue: 920000,
            }),
            comparison: {
              ...getComparisonProperties({
                changeType: "decrease",
                comparisonValue: 958469,
                dateStr: "Oct",
                metricValue: 920000,
              }),
            },
          },
        },
      ];

      it.each(testCases)(
        "$description",
        ({ rows, expected, dateUnit, field }) => {
          const insights = [{ unit: dateUnit, col: field }];
          const { trend } = computeTrend(
            series({ rows, cols }),
            insights,
            createSettings(field),
          );

          expect(getTrend(trend)).toEqual(expected);
        },
      );
    });

    describe("format options", () => {
      const countColumn = createMockNumberColumn({ name: "Count" });
      const monthColumn = createMockDateTimeColumn({ name: "Month" });

      const cols = [countColumn, monthColumn];
      const rows = [
        [105000, "2023-10-01T00:00:00"],
        [210000, "2024-10-01T00:00:00"],
      ];

      const series = [createMockSingleSeries({}, { data: { rows, cols } })];

      const insights = [{ unit: "month", col: "Count" }];

      const createVizSettings = settings =>
        createMockVisualizationSettings({
          column: column => ({ column }),
          "scalar.field": "Count",
          "scalar.comparisons": [
            { id: "1", type: COMPARISON_TYPES.PREVIOUS_VALUE },
          ],
          ...settings,
        });

      it("should have `compact: false` by default", () => {
        const {
          trend: {
            comparisons: [{ display: comparisonDisplay }],
            display,
            formatOptions,
          },
        } = computeTrend(series, insights, createVizSettings());

        expect(formatOptions.compact).toBeFalsy();
        expect(display.value).toBe("210,000");
        expect(comparisonDisplay.comparisonValue).toBe("105,000");
      });

      it("should have `compact: true` with `scalar.compact_primary_number` viz setting", () => {
        const {
          trend: {
            comparisons: [{ display: comparisonDisplay }],
            display,
            formatOptions,
          },
        } = computeTrend(
          series,
          insights,
          createVizSettings({
            "scalar.compact_primary_number": true,
          }),
        );

        expect(formatOptions.compact).toBe(true);
        expect(display.value).toBe("210.0k");
        expect(comparisonDisplay.comparisonValue).toBe("105.0k");
      });
    });

    it("should display full dates for native queries (issue #38122)", () => {
      const QUERY_TYPE = "native";
      const COMPARISON_TYPE = COMPARISON_TYPES.PERIODS_AGO;
      const getComparisonProperties =
        createGetComparisonProperties(COMPARISON_TYPE);

      const COUNT_FIELD = "Count";
      const createSettings = value =>
        createMockVisualizationSettings({
          "scalar.field": COUNT_FIELD,
          "scalar.comparisons": [{ id: "1", type: COMPARISON_TYPE, value }],
        });

      const cols = [
        createMockDateTimeColumn({ name: "date-field" }),
        createMockNumberColumn({ name: COUNT_FIELD }),
      ];

      const rows = [
        ["2023-12-31T02:12", 100],
        ["2023-12-31T04:15", 200],
      ];
      const dateUnit = "hour";
      const periodsAgo = 2;
      const expected = {
        ...getMetricProperties({
          dateStr: "December 31, 2023, 4:15 AM",
          metricValue: 200,
        }),
        comparison: {
          ...getComparisonProperties({
            changeType: "increase",
            comparisonValue: 100,
            dateStr: "December 31, 2023, 2:12 AM",
            metricValue: 200,
          }),
        },
      };

      const insights = [{ unit: dateUnit, col: COUNT_FIELD }];
      const { trend } = computeTrend(
        series({ rows, cols, queryType: QUERY_TYPE }),
        insights,
        createSettings(periodsAgo),
      );

      expect(getTrend(trend)).toEqual(expected);
    });
  });
});

function createGetComparisonProperties(comparisonType) {
  return ({ changeType, comparisonValue, dateStr, flipColor, metricValue }) =>
    getComparisonPropertiesByType({
      comparisonType,
      changeType,
      comparisonValue,
      dateStr,
      flipColor,
      metricValue,
    });
}

function getComparisonPropertiesByType({
  changeType,
  comparisonType,
  comparisonValue,
  dateStr,
  flipColor,
  metricValue,
}) {
  if (changeType === "decrease") {
    return {
      ...getComparisonChangeProperties({ changeType, flipColor }),
      ...getComparisonValueProperties({
        comparisonValue,
        dateStr,
        metricValue,
      }),
    };
  }

  if (changeType === "increase") {
    return {
      ...getComparisonChangeProperties({ changeType, flipColor }),
      ...getComparisonValueProperties({
        comparisonValue,
        dateStr,
        metricValue,
      }),
    };
  }

  if (changeType === "no change") {
    return {
      ...getComparisonChangeProperties({ changeType, flipColor }),
      ...getComparisonValueProperties({
        comparisonValue,
        changeType,
        dateStr,
        metricValue,
      }),
    };
  }

  if (changeType === "missing") {
    return {
      ...getComparisonChangeProperties({ changeType, flipColor }),
      ...getComparisonValueProperties({
        comparisonType,
        comparisonValue,
        changeType,
        dateStr,
        metricValue,
      }),
    };
  }

  return null;
}

function getComparisonChangeProperties({ changeType, flipColor }) {
  if (changeType === "decrease") {
    return {
      changeArrowIconName: CHANGE_ARROW_ICONS.ARROW_DOWN,
      changeColor: flipColor ? colors.success : colors.error,
      changeType: CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE,
    };
  }

  if (changeType === "increase") {
    return {
      changeArrowIconName: CHANGE_ARROW_ICONS.ARROW_UP,
      changeColor: flipColor ? colors.error : colors.success,
      changeType: CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE,
    };
  }

  if (changeType === "no change") {
    return {
      changeArrowIconName: undefined,
      changeColor: undefined,
      changeType: CHANGE_TYPE_OPTIONS.SAME.CHANGE_TYPE,
    };
  }

  return {
    changeArrowIconName: undefined,
    changeColor: undefined,
    changeType: CHANGE_TYPE_OPTIONS.MISSING.CHANGE_TYPE,
  };
}

function getComparisonValueProperties({
  comparisonType,
  comparisonValue,
  changeType,
  dateStr,
  metricValue,
}) {
  if (changeType === "missing") {
    const includeComparisonDescStr =
      comparisonType === COMPARISON_TYPES.PREVIOUS_PERIOD ||
      comparisonType === COMPARISON_TYPES.PERIODS_AGO;

    return {
      comparisonDescStr: includeComparisonDescStr
        ? `vs. ${dateStr}`
        : undefined,
      display: {
        comparisonValue: CHANGE_TYPE_OPTIONS.MISSING.COMPARISON_VALUE_STR,
        percentChange: CHANGE_TYPE_OPTIONS.MISSING.PERCENT_CHANGE_STR,
      },
    };
  }

  if (changeType === "no change") {
    return {
      comparisonValue: comparisonValue,
      comparisonDescStr: `vs. ${dateStr}`,
      display: {
        comparisonValue: CHANGE_TYPE_OPTIONS.SAME.COMPARISON_VALUE_STR,
        percentChange: CHANGE_TYPE_OPTIONS.SAME.PERCENT_CHANGE_STR,
      },
      percentChange: computeChange(comparisonValue, metricValue),
    };
  }

  return {
    comparisonValue: comparisonValue,
    comparisonDescStr: `vs. ${dateStr}`,
    display: {
      percentChange: formatChange(computeChange(comparisonValue, metricValue)),
      comparisonValue: formatValue(comparisonValue),
    },
    percentChange: computeChange(comparisonValue, metricValue),
  };
}

function getMetricProperties({ dateStr, metricValue }) {
  return {
    value: metricValue,
    display: {
      value: `${metricValue}`,
      date: dateStr,
    },
  };
}

function getComparison(comparison) {
  if (comparison === null) {
    return null;
  }

  const {
    changeArrowIconName,
    changeColor,
    changeType,
    comparisonDescStr,
    comparisonValue,
    display: {
      percentChange: percentChangeStr,
      comparisonValue: comparisonValueStr,
    },
    percentChange,
  } = comparison;

  return {
    changeArrowIconName,
    changeColor,
    changeType,
    comparisonDescStr,
    comparisonValue,
    display: {
      percentChange: percentChangeStr,
      comparisonValue: comparisonValueStr,
    },
    percentChange,
  };
}

function getTrend(trend) {
  if (trend === null) {
    return null;
  }

  const { value, display, comparisons } = trend;

  return {
    value,
    display: {
      value: display.value,
      date: display.date,
    },
    comparison: getComparison(comparisons[0]),
  };
}

function createMockDateTimeColumn(opts) {
  return createMockColumn({
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: null,
    ...opts,
  });
}

function createMockNumberColumn(opts) {
  return createMockColumn({
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/Number",
    ...opts,
  });
}
