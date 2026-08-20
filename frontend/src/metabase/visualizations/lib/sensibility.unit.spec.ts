import { registerVisualization } from "metabase/visualizations";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Visualization } from "metabase/visualizations/types";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  CustomVizDisplayType,
  DatasetData,
  RawSeries,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockLatitudeColumn,
  createMockLongitudeColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import {
  getSensibleDisplays,
  groupVisualizationsBySensibility,
} from "./sensibility";
import { DEFAULT_VIZ_ORDER } from "./viz-order";

registerVisualizations();

function throwUnsupportedData(): never {
  throw new Error("Unsupported data");
}

function registerCustomViz({
  display,
  checkRenderable,
}: {
  display: CustomVizDisplayType;
  checkRenderable: Visualization["checkRenderable"];
}) {
  registerVisualization({
    identifier: display,
    getUiName: () => `Custom viz ${display}`,
    checkRenderable,
  });
}

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

describe("getSensibleDisplays", () => {
  function createMockRawSeries(numRows: number): RawSeries {
    return [
      {
        card: createMockCard(),
        data: createMockData({ numRows, numMetrics: 1, numDateDimensions: 1 }),
      },
    ];
  }

  it("should keep a visualization without `isSensible` when it can render the data", () => {
    const display: CustomVizDisplayType = "custom:renderable";
    registerCustomViz({ display, checkRenderable: () => undefined });

    expect(getSensibleDisplays(createMockRawSeries(10))).toContain(display);
  });

  it("should drop a visualization without `isSensible` when it cannot render the data (metabase#GDGT-2218)", () => {
    const display: CustomVizDisplayType = "custom:not-renderable";
    registerCustomViz({ display, checkRenderable: throwUnsupportedData });

    expect(getSensibleDisplays(createMockRawSeries(10))).not.toContain(display);
  });

  it("should judge renderability of a visualization without `isSensible` even for a single row", () => {
    const display: CustomVizDisplayType = "custom:not-renderable-single-row";
    registerCustomViz({ display, checkRenderable: throwUnsupportedData });

    expect(getSensibleDisplays(createMockRawSeries(1))).not.toContain(display);
  });

  it("should never offer hidden visualizations", () => {
    expect(getSensibleDisplays(createMockRawSeries(10))).not.toContain("text");
  });

  it("should let a visualization with `isSensible` answer for itself", () => {
    const rawSeries = createMockRawSeries(10);

    expect(getSensibleDisplays(rawSeries)).toContain("line");
    expect(getSensibleDisplays(rawSeries)).not.toContain("scalar");
  });

  it("should keep every `isSensible` visualization for a single row (metabase#12476)", () => {
    expect(getSensibleDisplays(createMockRawSeries(1))).toContain("scalar");
  });

  it("should keep a visualization without `isSensible` for an empty result", () => {
    const display: CustomVizDisplayType = "custom:empty-result";
    registerCustomViz({ display, checkRenderable: throwUnsupportedData });

    expect(getSensibleDisplays(createMockRawSeries(0))).toContain(display);
  });

  it("should keep a visualization without `isSensible` when a guest embed has no data", () => {
    const display: CustomVizDisplayType = "custom:guest-embed-placeholder";
    registerCustomViz({ display, checkRenderable: throwUnsupportedData });
    const rawSeries: RawSeries = [
      {
        card: createMockCard(),
        data: createMockDatasetData({ cols: [], rows: [] }),
      },
    ];

    expect(getSensibleDisplays(rawSeries)).toContain(display);
  });
});

describe("getSensibleDisplays with maybeResetDisplay", () => {
  const DISPLAY: CustomVizDisplayType = "custom:needs-a-date-column";

  registerCustomViz({
    display: DISPLAY,
    checkRenderable: ([{ data }]) => {
      if (!data?.cols.some(isDate)) {
        throwUnsupportedData();
      }
    },
  });

  function createRawSeries(data: DatasetData): RawSeries {
    return [{ card: createMockCard({ display: DISPLAY }), data }];
  }

  const customVizQuestion = new Question(
    createMockCard({
      display: DISPLAY,
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
      },
    }),
    SAMPLE_METADATA,
  ).lockDisplay();

  const byDate = createRawSeries(
    createMockData({ numRows: 10, numMetrics: 1, numDateDimensions: 1 }),
  );
  const byCategory = createRawSeries(
    createMockData({ numRows: 10, numMetrics: 1, numStringDimensions: 1 }),
  );

  it("should switch away from a custom visualization that can no longer render the data (metabase#GDGT-2218)", () => {
    const question = customVizQuestion.maybeResetDisplay(
      byCategory[0].data,
      getSensibleDisplays(byCategory),
      // no previous data on the first drill
      undefined,
    );

    expect(question.displayIsLocked()).toBe(false);
    expect(question.display()).not.toBe(DISPLAY);
  });

  it("should keep a custom visualization that still renders the data", () => {
    const question = customVizQuestion.maybeResetDisplay(
      byDate[0].data,
      getSensibleDisplays(byDate),
      getSensibleDisplays(byDate),
    );

    expect(question.displayIsLocked()).toBe(true);
    expect(question.display()).toBe(DISPLAY);
  });
});
