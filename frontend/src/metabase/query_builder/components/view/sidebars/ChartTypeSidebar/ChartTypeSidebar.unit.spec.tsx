import { renderWithProviders, screen, within } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import {
  createMockCategoryColumn,
  createMockDatetimeColumn,
  createMockLatitudeColumn,
  createMockLongitudeColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { ChartTypeSidebar } from "./ChartTypeSidebar";

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
  return {
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
    })),
  };
}

function getRecommendedVisualizations() {
  return within(screen.getByTestId("display-options-sensible"))
    .getAllByRole("option")
    .map((option) => option.textContent.trim());
}

const testCases = [
  {
    numRows: 1,
    numMetrics: 1,
    numDateDimensions: 0,
    numStringDimensions: 0,
    latLong: false,
    expectedVisualizations: ["Number", "Gauge", "Progress"],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 1,
    numStringDimensions: 0,
    latLong: false,
    expectedVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Trend",
      "Scatter",
      "Waterfall",
    ],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 0,
    numStringDimensions: 1,
    latLong: false,
    expectedVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Map",
      "Scatter",
      "Waterfall",
    ],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 1,
    numStringDimensions: 1,
    latLong: false,
    expectedVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Scatter",
    ],
  },
  {
    numRows: 10,
    numMetrics: 2,
    numDateDimensions: 1,
    numStringDimensions: 0,
    latLong: false,
    expectedVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Trend",
      "Scatter",
      "Waterfall",
    ],
    expectedNativeVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Trend",
      "Map", // Map thinks the two metrics could be coordinates
      "Scatter",
      "Waterfall",
    ],
  },
  {
    numRows: 10,
    numMetrics: 2,
    numDateDimensions: 0,
    numStringDimensions: 1,
    latLong: false,
    expectedVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Map",
      "Scatter",
      "Waterfall",
    ],
  },
  {
    numRows: 10,
    numMetrics: 1,
    numDateDimensions: 0,
    numStringDimensions: 0,
    latLong: true,
    expectedVisualizations: ["Table", "Pivot Table", "Map", "Scatter"],
    // lat/long looks the same as two metrics in a native query
    expectedNativeVisualizations: [
      "Table",
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Map",
      "Scatter",
    ],
  },
];

describe("ChartTypeSidebar", () => {
  describe.each([false, true])("isNative=%s", (isNative) => {
    it.each(testCases)(
      "recommends the correct visualizations for $numRows row(s), $numMetrics metric(s), $numDateDimensions date dim(s), $numStringDimensions string dim(s), $latLong lat/long dims",
      ({
        numRows,
        numMetrics,
        numDateDimensions,
        numStringDimensions,
        latLong,
        expectedVisualizations,
        expectedNativeVisualizations,
      }) => {
        const data = createMockData({
          numRows,
          numMetrics,
          numDateDimensions,
          numStringDimensions,
          latLong,
          isNative,
        });

        const question = null as unknown as Question;
        const result = { data } as Dataset;

        renderWithProviders(
          <ChartTypeSidebar question={question} result={result} />,
        );

        // Pivot Table is not supported for native queries
        const finalExpectedVisualizations = isNative
          ? (expectedNativeVisualizations ??
            expectedVisualizations.filter((v) => v !== "Pivot Table"))
          : expectedVisualizations;

        expect(getRecommendedVisualizations()).toEqual(
          finalExpectedVisualizations,
        );
      },
    );
  });
  it("recommends the correct visualizations for an unaggregated table", () => {
    const question = null as unknown as Question;
    const result = {
      data: {
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
      },
    } as Dataset;

    renderWithProviders(
      <ChartTypeSidebar question={question} result={result} />,
    );

    expect(getRecommendedVisualizations()).toEqual([
      "Table",
      "Detail",
      "Map",
      "Scatter",
    ]);
  });
});
