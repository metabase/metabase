import type {
  ExplorationQuery,
  ExplorationQueryStatus,
  RowValues,
  SingleSeries,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

// `isCartesianChart` reads from the visualization registry, which is
// empty in jest. Stub it so `composeChartsForDocumentEmbed` recognises
// "line"/"bar" as cartesian and runs the graph.dimensions augmentation.
jest.mock("metabase/visualizations", () => ({
  __esModule: true,
  isCartesianChart: (display: string) =>
    ["line", "bar", "area", "combo", "row", "scatter", "waterfall"].includes(
      display,
    ),
}));

import type { SeriesGroup } from "./utils";
import {
  composeChartsForDocumentEmbed,
  getHeatMapSeries,
  getInterestingTimelineIds,
  getMaxTimelineInterestingness,
  getMostInterestingTimelineId,
} from "./utils";

function makeQuery(
  overrides: Partial<ExplorationQuery> & {
    id: number;
    timeline_interestingness?: ExplorationQuery["timeline_interestingness"];
  },
): ExplorationQuery {
  return {
    exploration_thread_id: 1,
    card_id: 1,
    dimension_id: "dim-1",
    dimension_name: "Dim 1",
    query_type: "default",
    display: null,
    name: `q-${overrides.id}`,
    position: 0,
    status: "done" as ExplorationQueryStatus,
    error_message: null,
    started_at: null,
    finished_at: null,
    entity_id: "abcdefghijabcdefghij1",
    interestingness_score: 0.5,
    dataset_query: { type: "query", database: 1, query: {} } as any,
    segment_id: null,
    ...overrides,
  };
}

function makeHeatMapSeries(name: string, rows: RowValues[]): SingleSeries {
  return {
    card: createMockCard({ name, display: "table" }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "Dimension" }),
        createMockColumn({ name: "Value" }),
      ],
      rows,
    }),
  };
}

describe("getHeatMapSeries", () => {
  it("labels the Segment column with the real segment name", () => {
    const { data } = getHeatMapSeries({
      series: [
        makeHeatMapSeries("Revenue by Plan", [["A", 1]]),
        makeHeatMapSeries("Revenue by Plan (Enterprise)", [["A", 2]]),
        makeHeatMapSeries("Revenue by Plan (SMB)", [["A", 3]]),
      ],
    });

    const segmentColumn = data.rows.map((row) => row[row.length - 1]);
    expect(segmentColumn).toEqual(["(All)", "Enterprise", "SMB"]);
  });

  it("falls back to the full series name when it lacks the segment suffix", () => {
    const { data } = getHeatMapSeries({
      series: [
        makeHeatMapSeries("Revenue by Plan", [["A", 1]]),
        makeHeatMapSeries("Unrelated name", [["A", 2]]),
      ],
    });

    const segmentColumn = data.rows.map((row) => row[row.length - 1]);
    expect(segmentColumn).toEqual(["(All)", "Unrelated name"]);
  });
});

describe("getMaxTimelineInterestingness", () => {
  it("returns an empty map when no query has timeline_interestingness", () => {
    expect(
      getMaxTimelineInterestingness([
        makeQuery({ id: 1 }),
        makeQuery({ id: 2 }),
      ]).size,
    ).toBe(0);
  });

  it("ignores entries with null score", () => {
    const result = getMaxTimelineInterestingness([
      makeQuery({
        id: 1,
        timeline_interestingness: [
          { timeline_id: 10, interestingness_score: null },
          { timeline_id: 20, interestingness_score: 0.8 },
        ],
      }),
    ]);
    expect(result.has(10)).toBe(false);
    expect(result.get(20)).toBeCloseTo(0.8);
  });

  it("takes the max score across queries per timeline", () => {
    const result = getMaxTimelineInterestingness([
      makeQuery({
        id: 1,
        timeline_interestingness: [
          { timeline_id: 10, interestingness_score: 0.4 },
          { timeline_id: 20, interestingness_score: 0.9 },
        ],
      }),
      makeQuery({
        id: 2,
        timeline_interestingness: [
          { timeline_id: 10, interestingness_score: 0.85 },
          { timeline_id: 20, interestingness_score: 0.6 },
        ],
      }),
    ]);
    expect(result.get(10)).toBeCloseTo(0.85);
    expect(result.get(20)).toBeCloseTo(0.9);
  });
});

describe("getInterestingTimelineIds", () => {
  it("includes only timelines whose max score passes the 0.7 threshold", () => {
    const result = getInterestingTimelineIds([
      makeQuery({
        id: 1,
        timeline_interestingness: [
          { timeline_id: 10, interestingness_score: 0.69 }, // below
          { timeline_id: 20, interestingness_score: 0.7 }, // exact threshold passes
          { timeline_id: 30, interestingness_score: 0.95 }, // well above
        ],
      }),
    ]);
    expect(result.has(10)).toBe(false);
    expect(result.has(20)).toBe(true);
    expect(result.has(30)).toBe(true);
  });

  it("aggregates across queries (max-rule): a timeline that's interesting for ANY query is interesting", () => {
    const result = getInterestingTimelineIds([
      makeQuery({
        id: 1,
        timeline_interestingness: [
          { timeline_id: 10, interestingness_score: 0.4 },
        ],
      }),
      makeQuery({
        id: 2,
        timeline_interestingness: [
          { timeline_id: 10, interestingness_score: 0.9 },
        ],
      }),
    ]);
    expect(result.has(10)).toBe(true);
  });
});

describe("getMostInterestingTimelineId", () => {
  it("returns the highest-scoring timeline whose id is available", () => {
    const id = getMostInterestingTimelineId(
      [
        makeQuery({
          id: 1,
          timeline_interestingness: [
            { timeline_id: 10, interestingness_score: 0.8 },
            { timeline_id: 20, interestingness_score: 0.95 },
            { timeline_id: 30, interestingness_score: 0.75 },
          ],
        }),
      ],
      new Set([10, 20, 30]),
    );
    expect(id).toBe(20);
  });

  it("skips timelines that are not in the available set even if they score higher", () => {
    const id = getMostInterestingTimelineId(
      [
        makeQuery({
          id: 1,
          timeline_interestingness: [
            { timeline_id: 10, interestingness_score: 0.99 }, // not available
            { timeline_id: 20, interestingness_score: 0.85 },
          ],
        }),
      ],
      new Set([20]),
    );
    expect(id).toBe(20);
  });

  it("returns null when no available timeline passes the threshold", () => {
    const id = getMostInterestingTimelineId(
      [
        makeQuery({
          id: 1,
          timeline_interestingness: [
            { timeline_id: 10, interestingness_score: 0.5 },
            { timeline_id: 20, interestingness_score: 0.6 },
          ],
        }),
      ],
      new Set([10, 20]),
    );
    expect(id).toBeNull();
  });

  it("returns null when no timeline has scores and more than one is available", () => {
    const id = getMostInterestingTimelineId(
      [makeQuery({ id: 1 })],
      new Set([10, 20]),
    );
    expect(id).toBeNull();
  });

  it("auto-picks the sole available timeline even when no query has scored it", () => {
    const id = getMostInterestingTimelineId(
      [makeQuery({ id: 1 })],
      new Set([10]),
    );
    expect(id).toBe(10);
  });

  it("uses max-across-queries when picking the best", () => {
    // Timeline 10 scores 0.85 on q1 and 0.4 on q2 → max 0.85.
    // Timeline 20 scores 0.6 on q1 and 0.9 on q2 → max 0.9. Wins.
    const id = getMostInterestingTimelineId(
      [
        makeQuery({
          id: 1,
          timeline_interestingness: [
            { timeline_id: 10, interestingness_score: 0.85 },
            { timeline_id: 20, interestingness_score: 0.6 },
          ],
        }),
        makeQuery({
          id: 2,
          timeline_interestingness: [
            { timeline_id: 10, interestingness_score: 0.4 },
            { timeline_id: 20, interestingness_score: 0.9 },
          ],
        }),
      ],
      new Set([10, 20]),
    );
    expect(id).toBe(20);
  });
});

// `SeriesGroup` is internal to utils.ts. Reconstruct just the fields
// `composeChartsForDocumentEmbed` reads — typed as `any` because we
// don't need (and don't have) the full shape.
function makeCartesianSeries(id: number, name: string): SingleSeries {
  return {
    card: createMockCard({
      id,
      name,
      display: "line",
      visualization_settings: { "graph.split_panels": true },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [],
    }),
  };
}

function makeMapSeries(id: number, name: string, color: string): SingleSeries {
  return {
    card: createMockCard({
      id,
      name,
      display: "map",
      visualization_settings: {
        "map.type": "region",
        "map.region": "us_states",
        "map.colors": [color, "white"],
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "state" }),
        createMockColumn({ name: "value" }),
      ],
      rows: [],
    }),
  };
}

function makeGroup(
  series: SingleSeries[],
  overrides: Partial<SeriesGroup> = {},
): SeriesGroup {
  return {
    series,
    queryType: "default",
    isTimeseries: false,
    ...overrides,
  };
}

describe("composeChartsForDocumentEmbed", () => {
  it("expands a multi-series map SeriesGroup into one entry per map (the user perceives them as separate charts)", () => {
    const group = makeGroup([
      makeMapSeries(101, "US sessions", "red"),
      makeMapSeries(102, "EU sessions", "blue"),
      makeMapSeries(103, "APAC sessions", "green"),
    ]);

    const charts = composeChartsForDocumentEmbed([group]);

    expect(charts).toHaveLength(3);
    expect(charts.map((c) => c.queryIds)).toEqual([[101], [102], [103]]);
    expect(charts.map((c) => c.label)).toEqual([
      "US sessions",
      "EU sessions",
      "APAC sessions",
    ]);
    expect(charts.map((c) => c.display)).toEqual(["map", "map", "map"]);
    // Per-map `map.colors` survives — each entry carries its own ramp.
    expect(charts[0].visualization_settings["map.colors"]).toEqual([
      "red",
      "white",
    ]);
    expect(charts[1].visualization_settings["map.colors"]).toEqual([
      "blue",
      "white",
    ]);
  });

  it("keeps a single-series map SeriesGroup as one entry", () => {
    const group = makeGroup([makeMapSeries(42, "World sessions", "red")]);

    const charts = composeChartsForDocumentEmbed([group]);

    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({
      queryIds: [42],
      label: "World sessions",
      display: "map",
    });
  });

  it("keeps a multi-series cartesian SeriesGroup as ONE composite entry with all source query ids", () => {
    // Cartesian + heat-map paths combine on the BE — only maps expand.
    const group = makeGroup([
      makeCartesianSeries(1, "Q1"),
      makeCartesianSeries(2, "Q2"),
    ]);

    const charts = composeChartsForDocumentEmbed([group]);

    expect(charts).toHaveLength(1);
    expect(charts[0].queryIds).toEqual([1, 2]);
    expect(charts[0].display).toBe("line");
    // The cartesian augmentation pins `graph.dimensions` so the BE-added
    // "Series" discriminator column becomes the breakout.
    expect(charts[0].visualization_settings["graph.dimensions"]).toEqual([
      "ts",
      "Series",
    ]);
  });

  it("handles a mixed page: cartesian composite + multi-map expansion + single-series side by side", () => {
    const cartesianGroup = makeGroup([
      makeCartesianSeries(10, "US"),
      makeCartesianSeries(11, "EU"),
    ]);
    const mapGroup = makeGroup([
      makeMapSeries(20, "US sessions", "red"),
      makeMapSeries(21, "EU sessions", "blue"),
    ]);
    const singleGroup = makeGroup([makeCartesianSeries(30, "Solo")]);

    const charts = composeChartsForDocumentEmbed([
      cartesianGroup,
      mapGroup,
      singleGroup,
    ]);

    // 1 composite cartesian + 2 expanded maps + 1 single = 4 picker entries.
    expect(charts).toHaveLength(4);
    expect(charts.map((c) => c.queryIds)).toEqual([
      [10, 11], // composite
      [20], // map 1
      [21], // map 2
      [30], // single
    ]);
  });
});
