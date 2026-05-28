import {
  createExplorationDocument,
  createQuery,
  createThread,
} from "metabase/explorations/test-utils";
import registerVisualizations from "metabase/visualizations/register";
import type {
  Dataset,
  ExplorationQuery,
  RowValues,
  SingleSeries,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
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
  buildSeries,
  buildSeriesGroups,
  composeChartsForDocumentEmbed,
  getDocumentsForDocumentMenu,
  getHeatMapSeries,
  getInterestingTimelineIds,
  getMaxTimelineInterestingness,
  getMostInterestingTimelineId,
} from "./utils";

registerVisualizations();

function makeQuery(
  overrides: Partial<ExplorationQuery> & {
    id: number;
    timeline_interestingness?: ExplorationQuery["timeline_interestingness"];
  },
): ExplorationQuery {
  return createQuery({
    status: "done",
    ...overrides,
    name: overrides.name ?? `q-${overrides.id}`,
  });
}

function makeDataset(
  cols: ReturnType<typeof createMockColumn>[],
  rows: RowValues[],
): Dataset {
  return createMockDataset({
    data: createMockDatasetData({ cols, rows }),
  });
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

describe("buildSeries (display selection)", () => {
  const metricsById = new Map();
  const queryColors = { "1": "#509EE3", "2": "#88BF4D" };

  function buildOneSeries(
    query: ExplorationQuery,
    dataset: Dataset,
    extraQueriesInGroup: { query: ExplorationQuery; dataset: Dataset }[] = [],
  ) {
    const group = [
      { ...query, dataset },
      ...extraQueriesInGroup.map(({ query: q, dataset: d }) => ({
        ...q,
        dataset: d,
      })),
    ];
    return buildSeries({
      queriesWithDatasets: group,
      metricsById,
      queryColors,
    });
  }

  it("sets the y-axis title from the thread metric name", () => {
    const query = makeQuery({ id: 1, card_id: 42 });
    const dataset = makeDataset(
      [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["2025-01-01", 1]],
    );
    const metricsByIdWithName = new Map();
    metricsByIdWithName.set(query.card_id, {
      id: 1,
      exploration_thread_id: 1,
      card_id: query.card_id,
      dimension_mappings: null,
      position: 0,
      card: { name: "Total Revenue" },
    });
    const group = buildSeries({
      queriesWithDatasets: [{ ...query, dataset }],
      metricsById: metricsByIdWithName,
      queryColors,
    });
    expect(
      group.series[0].card.visualization_settings["graph.y_axis.title_text"],
    ).toBe("Total Revenue");
  });

  it("picks line with split panels for a 2-column timeseries dataset", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["2025-01-01", 1]],
    );
    const group = buildOneSeries(query, dataset);
    expect(group.series[0].card.display).toBe("line");
    expect(
      group.series[0].card.visualization_settings["graph.split_panels"],
    ).toBe(true);
    expect(group.isTimeseries).toBe(true);
  });

  it("picks a US state map for a 2-column state dataset", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({
          name: "state",
          base_type: "type/Text",
          semantic_type: "type/State",
        }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["CA", 10]],
    );
    const group = buildOneSeries(query, dataset);
    expect(group.series[0].card.display).toBe("map");
    expect(group.series[0].card.visualization_settings["map.region"]).toBe(
      "us_states",
    );
  });

  it("picks a world countries map for a 2-column country dataset", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({
          name: "country",
          base_type: "type/Text",
          semantic_type: "type/Country",
        }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["US", 10]],
    );
    const group = buildOneSeries(query, dataset);
    expect(group.series[0].card.display).toBe("map");
    expect(group.series[0].card.visualization_settings["map.region"]).toBe(
      "world_countries",
    );
  });

  it("picks bar for a 2-column categorical dataset", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({ name: "category", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["A", 1]],
    );
    const group = buildOneSeries(query, dataset);
    expect(group.series[0].card.display).toBe("bar");
  });

  it("picks table heat-map when the group has enough segment queries", () => {
    const queries = Array.from({ length: 4 }, (_, i) =>
      makeQuery({ id: i + 1, segment_id: i + 1 }),
    );
    const categorical = makeDataset(
      [
        createMockColumn({ name: "category", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["A", 1]],
    );
    const group = buildSeries({
      queriesWithDatasets: queries.map((q) => ({ ...q, dataset: categorical })),
      metricsById,
      queryColors,
    });
    expect(group.series[0].card.display).toBe("table");
  });

  it("assigns distinct map color ramps per query id", () => {
    const dataset = makeDataset(
      [
        createMockColumn({
          name: "state",
          base_type: "type/Text",
          semantic_type: "type/State",
        }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["CA", 10]],
    );
    const group = buildSeries({
      queriesWithDatasets: [
        { ...makeQuery({ id: 1 }), dataset },
        { ...makeQuery({ id: 2 }), dataset },
      ],
      metricsById,
      queryColors,
    });
    const ramp1 = group.series[0].card.visualization_settings["map.colors"];
    const ramp2 = group.series[1].card.visualization_settings["map.colors"];
    expect(ramp1?.[0]).not.toEqual(ramp2?.[0]);
  });
});

describe("buildSeriesGroups", () => {
  it("groups queries by dimension_id and query_type", () => {
    const datasets = [
      makeDataset(
        [
          createMockColumn({ name: "ts", base_type: "type/DateTime" }),
          createMockColumn({ name: "count", base_type: "type/Integer" }),
        ],
        [["2025-01-01", 1]],
      ),
      makeDataset(
        [
          createMockColumn({ name: "ts", base_type: "type/DateTime" }),
          createMockColumn({ name: "count", base_type: "type/Integer" }),
        ],
        [["2025-01-01", 2]],
      ),
    ];
    const queries = [
      makeQuery({ id: 1, dimension_id: "dim-a" }),
      makeQuery({ id: 2, dimension_id: "dim-b" }),
    ];
    const { seriesGroups } = buildSeriesGroups({
      queries,
      datasets,
      metricsById: new Map(),
      queryColors: {},
    });
    expect(seriesGroups).toHaveLength(2);
  });

  it('picks "two-small-charts-down" for the temporal pattern trio', () => {
    const tsDataset = makeDataset(
      [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["2025-01-01", 1]],
    );
    const queries = [
      makeQuery({ id: 1, dimension_id: "dim-1", query_type: "default" }),
      makeQuery({
        id: 2,
        dimension_id: "dim-2",
        query_type: "temporal-pattern-day",
      }),
      makeQuery({
        id: 3,
        dimension_id: "dim-3",
        query_type: "temporal-pattern-hour",
      }),
    ];
    const { layoutStrategy } = buildSeriesGroups({
      queries,
      datasets: [tsDataset, tsDataset, tsDataset],
      metricsById: new Map(),
      queryColors: {},
    });
    expect(layoutStrategy).toBe("two-small-charts-down");
  });

  it("strips axis titles from series in labeled layouts", () => {
    const tsDataset = makeDataset(
      [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["2025-01-01", 1]],
    );
    const queries = [
      makeQuery({ id: 1, dimension_id: "dim-1", query_type: "default" }),
      makeQuery({
        id: 2,
        dimension_id: "dim-2",
        query_type: "time-facet",
      }),
    ];
    const { seriesGroups } = buildSeriesGroups({
      queries,
      datasets: [tsDataset, tsDataset],
      metricsById: new Map(),
      queryColors: {},
    });
    expect(
      seriesGroups[0].series[0].card.visualization_settings[
        "graph.y_axis.title_text"
      ],
    ).toBe("");
    expect(seriesGroups[1].chartLabel).toBe("Over time");
  });
});

describe("getDocumentsForDocumentMenu", () => {
  it("excludes the AI summary document from the menu list", () => {
    const documents = [
      createExplorationDocument({ id: 1, name: "Notes" }),
      createExplorationDocument({ id: 2, name: "Summary" }),
    ];
    const thread = createThread({
      documents,
      ai_summary_document_id: 2,
    });
    expect(getDocumentsForDocumentMenu(thread).map((d) => d.id)).toEqual([1]);
  });
});
