import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCategoryColumn,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockLatitudeColumn,
  createMockLongitudeColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { groupVisualizationsBySensibility } from "./sensibility-grouping";
import { DEFAULT_VIZ_ORDER } from "./viz-order";

registerVisualizations();

function createMockMetrics(count: number, isNative: boolean) {
  return Array.from({ length: count }, (_, i) =>
    createMockNumericColumn({
      name: `Metric${i + 1}`,
      source: isNative ? "native" : "aggregation",
    }),
  );
}

function createMockMetricValues(i: number, count: number) {
  return Array.from({ length: count }, (_, j) => i * count + j);
}

function createMockDateDimensions(count: number, isNative: boolean) {
  return Array.from({ length: count }, (_, i) =>
    createMockDatetimeColumn({
      name: `Date${i + 1}`,
      display_name: `Date${i + 1}`,
      source: isNative ? "native" : "breakout",
    }),
  );
}

function createMockDateValues(i: number, count: number) {
  return Array.from({ length: count }, (_, j) =>
    new Date(2026, i * count + j, 1).toISOString(),
  );
}

function createMockStringDimensions(count: number, isNative: boolean) {
  return Array.from({ length: count }, (_, i) =>
    createMockCategoryColumn({
      name: `Category${i + 1}`,
      display_name: `Category${i + 1}`,
      source: isNative ? "native" : "breakout",
      semantic_type: isNative ? undefined : "type/Category",
    }),
  );
}

function createMockStringValues(i: number, count: number) {
  return Array.from({ length: count }, (_, j) => `String${i * count + j}`);
}

function createMockLatLongDimensions(latLong: boolean, isNative: boolean) {
  if (!latLong) {
    return [];
  }
  if (isNative) {
    return [
      createMockNumericColumn({
        name: "Latitude",
        display_name: "Latitude",
        source: "native",
      }),
      createMockNumericColumn({
        name: "Longitude",
        display_name: "Longitude",
        source: "native",
      }),
    ];
  }
  return [
    createMockLatitudeColumn({
      name: "Latitude",
      display_name: "Latitude",
      source: "breakout",
    }),
    createMockLongitudeColumn({
      name: "Longitude",
      display_name: "Longitude",
      source: "breakout",
    }),
  ];
}

function createMockLatLongValues(i: number, latLong: boolean) {
  return latLong ? [30 + i, -80 + i] : [];
}

function createMockData({
  numRows = 10,
  numMetrics = 0,
  numDateDimensions = 0,
  numStringDimensions = 0,
  latLong = false,
  isNative = false,
}: {
  numRows?: number;
  numMetrics?: number;
  numDateDimensions?: number;
  numStringDimensions?: number;
  latLong?: boolean;
  isNative?: boolean;
}) {
  const dateCols = createMockDateDimensions(numDateDimensions, isNative);
  return createMockDatasetData({
    cols: [
      ...createMockMetrics(numMetrics, isNative),
      ...dateCols,
      ...createMockStringDimensions(numStringDimensions, isNative),
      ...createMockLatLongDimensions(latLong, isNative),
    ],
    rows: Array.from({ length: numRows }, (_, i) => [
      ...createMockMetricValues(i, numMetrics),
      ...createMockDateValues(i, numDateDimensions),
      ...createMockStringValues(i, numStringDimensions),
      ...createMockLatLongValues(i, latLong),
    ]),
    insights: dateCols.map((col) => ({
      col: col.name,
      unit: "month",
      offset: 0,
      slope: 0,
      "last-change": 0,
      "last-value": 0,
      "previous-value": 0,
    })),
  });
}

const testCases = [
  {
    numRows: 1,
    numMetrics: 1,
    numDateDimensions: 0,
    numStringDimensions: 0,
    latLong: false,
    expectedRecommended: ["scalar", "gauge", "progress"],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 1,
    numStringDimensions: 0,
    latLong: false,
    expectedRecommended: [
      "line",
      "area",
      "bar",
      "combo",
      "smartscalar",
      "row",
      "waterfall",
      "scatter",
      "pie",
      "table",
      "pivot",
    ],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 0,
    numStringDimensions: 1,
    latLong: false,
    expectedRecommended: [
      "bar",
      "row",
      "pie",
      "line",
      "area",
      "combo",
      "waterfall",
      "scatter",
      "table",
      "pivot",
    ],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 1,
    numStringDimensions: 1,
    latLong: false,
    expectedRecommended: [
      "line",
      "area",
      "bar",
      "combo",
      "row",
      "scatter",
      "pie",
      "table",
      "pivot",
    ],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 0,
    numStringDimensions: 0,
    latLong: true,
    expectedRecommended: ["map", "table", "pivot", "scatter"],
    // lat/long looks the same as two metrics in a native query
    expectedNativeRecommended: [
      "bar",
      "row",
      "pie",
      "line",
      "area",
      "combo",
      "scatter",
      "table",
    ],
  },
];

describe("groupVisualizationsBySensibility", () => {
  describe.each([false, true])("isNative=%s", (isNative) => {
    it.each(testCases)(
      "recommends the correct visualizations for $numRows row(s), $numMetrics metric(s), $numDateDimensions date dim(s), $numStringDimensions string dim(s), $latLong lat/long dims",
      ({
        numRows,
        numMetrics,
        numDateDimensions,
        numStringDimensions,
        latLong,
        expectedRecommended,
        expectedNativeRecommended,
      }) => {
        const data = createMockData({
          numRows,
          numMetrics,
          numDateDimensions,
          numStringDimensions,
          latLong,
          isNative,
        });

        const { recommended } = groupVisualizationsBySensibility({
          orderedVizTypes: DEFAULT_VIZ_ORDER,
          data,
        });

        // pivot is not supported for native queries
        const finalExpectedRecommended = isNative
          ? (expectedNativeRecommended ??
            expectedRecommended.filter((v) => v !== "pivot"))
          : expectedRecommended;

        expect(recommended).toStrictEqual(finalExpectedRecommended);
      },
    );
  });
  it("recommends the correct visualizations for an unaggregated table", () => {
    const data = createMockDatasetData({
      cols: [
        createMockCategoryColumn({
          name: "Col1",
          display_name: "Col1",
          source: "fields",
        }),
        createMockNumericColumn({
          name: "Col2",
          display_name: "Col2",
          source: "fields",
        }),
      ],
      rows: [
        ["a", 2],
        ["b", 4],
        ["c", 6],
      ],
    });

    const { recommended } = groupVisualizationsBySensibility({
      orderedVizTypes: DEFAULT_VIZ_ORDER,
      data,
    });

    expect(recommended).toStrictEqual(["table", "object", "map", "scatter"]);
  });
});
