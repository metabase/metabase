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

import {
  buildSeries,
  buildSeriesGroups,
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
      segmentNames: [null, "Enterprise", "SMB"],
    });

    const segmentColumn = data.rows.map((row) => row[row.length - 1]);
    expect(segmentColumn).toEqual(["(All)", "Enterprise", "SMB"]);
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

describe("chartsForDocumentEmbed (via buildSeriesGroups)", () => {
  const stateCol = createMockColumn({
    name: "state",
    base_type: "type/Text",
    semantic_type: "type/State",
  });
  const countCol = createMockColumn({
    name: "count",
    base_type: "type/Integer",
  });
  const tsCol = createMockColumn({ name: "ts", base_type: "type/DateTime" });

  const stateDataset = makeDataset([stateCol, countCol], [["CA", 10]]);
  const tsDataset = makeDataset([tsCol, countCol], [["2025-01-01", 1]]);

  function getChartsForDocumentEmbed(
    queries: ExplorationQuery[],
    datasets: Dataset[],
  ) {
    return buildSeriesGroups({
      queries,
      datasets,
      queryColors: {},
    }).chartsForDocumentEmbed;
  }

  it("expands a multi-series map group into one entry per map", () => {
    const charts = getChartsForDocumentEmbed(
      [
        makeQuery({ id: 101, name: "US sessions", dimension_id: "dim-1" }),
        makeQuery({ id: 102, name: "EU sessions", dimension_id: "dim-1" }),
        makeQuery({ id: 103, name: "APAC sessions", dimension_id: "dim-1" }),
      ],
      [stateDataset, stateDataset, stateDataset],
    );

    expect(charts).toHaveLength(3);
    expect(charts.map((c) => c.queryIds)).toEqual([[101], [102], [103]]);
    expect(charts.map((c) => c.label)).toEqual([
      "US sessions",
      "EU sessions",
      "APAC sessions",
    ]);
    expect(charts.map((c) => c.display)).toEqual(["map", "map", "map"]);
  });

  it("keeps a single-series map as one entry", () => {
    const charts = getChartsForDocumentEmbed(
      [makeQuery({ id: 42, name: "World sessions" })],
      [stateDataset],
    );

    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({
      queryIds: [42],
      label: "World sessions",
      display: "map",
    });
  });

  it("keeps a multi-series cartesian group as ONE composite entry with all source query ids", () => {
    const charts = getChartsForDocumentEmbed(
      [
        makeQuery({ id: 1, name: "Q1", dimension_id: "dim-1" }),
        makeQuery({ id: 2, name: "Q2", dimension_id: "dim-1" }),
      ],
      [tsDataset, tsDataset],
    );

    expect(charts).toHaveLength(1);
    expect(charts[0].queryIds).toEqual([1, 2]);
    expect(charts[0].display).toBe("line");
    expect(charts[0].visualization_settings["graph.dimensions"]).toEqual([
      "ts",
      "Series",
    ]);
  });

  it("handles a mixed page: cartesian composite + multi-map expansion + single-series side by side", () => {
    const charts = getChartsForDocumentEmbed(
      [
        makeQuery({ id: 10, name: "US", dimension_id: "dim-1" }),
        makeQuery({ id: 11, name: "EU", dimension_id: "dim-1" }),
        makeQuery({ id: 20, name: "US sessions", dimension_id: "dim-2" }),
        makeQuery({ id: 21, name: "EU sessions", dimension_id: "dim-2" }),
        makeQuery({ id: 30, name: "Solo", dimension_id: "dim-3" }),
      ],
      [tsDataset, tsDataset, stateDataset, stateDataset, tsDataset],
    );

    // 1 composite cartesian + 2 expanded maps + 1 single = 4 picker entries.
    expect(charts).toHaveLength(4);
    expect(charts.map((c) => c.queryIds)).toEqual([[10, 11], [20], [21], [30]]);
  });
});

describe("buildSeries (display selection)", () => {
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
      queryColors,
    });
  }

  it("disables cartesian axis labels by default", () => {
    const query = makeQuery({ id: 1 });
    const dataset = makeDataset(
      [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["2025-01-01", 1]],
    );
    const group = buildOneSeries(query, dataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(false);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("enables the x-axis label for the 3-column time-facet shape", () => {
    const query = makeQuery({ id: 1, query_type: "time-facet" });
    const dataset = makeDataset(
      [
        createMockColumn({ name: "category", base_type: "type/Text" }),
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["A", "2025-01-01", 1]],
    );
    const group = buildOneSeries(query, dataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(true);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
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
      queryColors: {},
    });
    expect(layoutStrategy).toBe("two-small-charts-down");
  });

  it("assigns chart labels in labeled layouts and disables cartesian axis labels", () => {
    const tsDataset = makeDataset(
      [
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["2025-01-01", 1]],
    );
    const timeFacetDataset = makeDataset(
      [
        createMockColumn({ name: "category", base_type: "type/Text" }),
        createMockColumn({ name: "ts", base_type: "type/DateTime" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [["A", "2025-01-01", 1]],
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
      datasets: [tsDataset, timeFacetDataset],
      queryColors: {},
    });
    expect(
      seriesGroups[0].series[0].card.visualization_settings[
        "graph.y_axis.labels_enabled"
      ],
    ).toBe(false);
    expect(seriesGroups[1].chartLabel).toBe("Over time");
    expect(
      seriesGroups[1].series[0].card.visualization_settings[
        "graph.x_axis.labels_enabled"
      ],
    ).toBe(true);
    expect(
      seriesGroups[1].series[0].card.visualization_settings[
        "graph.y_axis.labels_enabled"
      ],
    ).toBe(false);
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
