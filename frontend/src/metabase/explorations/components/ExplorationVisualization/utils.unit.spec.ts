import {
  createExplorationDocument,
  createQuery,
  createThread,
} from "metabase/explorations/test-utils";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { formatBreakoutValue } from "metabase/visualizations/echarts/cartesian/model/series";
import { buildColorScale } from "metabase/visualizations/lib/choropleth";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import registerVisualizations from "metabase/visualizations/register";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
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
  buildSeriesGroup,
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

/** Matches MIN_ROWS_TO_SHOW_LINE_OR_BAR in utils.ts */
const MIN_ROWS_TO_SHOW_LINE_OR_BAR = 3;

function makeTsRows(count: number): RowValues[] {
  return Array.from({ length: count }, (_, i) => [
    `2025-01-${String(i + 1).padStart(2, "0")}`,
    i + 1,
  ]);
}

function makeCategoricalRows(
  categories: RowValues,
  valueFn: (index: number) => number = (index) => index + 1,
): RowValues[] {
  return categories.map((category, index) => [category, valueFn(index)]);
}

function ensureCategoriesAboveRowFallbackThreshold(
  categories: string[],
): string[] {
  if (categories.length > MIN_ROWS_TO_SHOW_LINE_OR_BAR) {
    return categories;
  }
  const result = [...categories];
  for (let i = 0; result.length <= MIN_ROWS_TO_SHOW_LINE_OR_BAR; i++) {
    result.push(`__extra-${i}`);
  }
  return result;
}

const TS_COL = createMockColumn({
  name: "ts",
  base_type: "type/DateTime",
});
const COUNT_COL = createMockColumn({
  name: "count",
  base_type: "type/Integer",
});
const CATEGORY_COL = createMockColumn({
  name: "category",
  base_type: "type/Text",
});
const STATE_COL = createMockColumn({
  name: "state",
  base_type: "type/Text",
  semantic_type: "type/State",
});

/** Enough rows to keep line/bar charts (above the row-fallback threshold). */
const tsDataset = makeDataset([TS_COL, COUNT_COL], makeTsRows(4));
const categoricalDataset = makeDataset(
  [CATEGORY_COL, COUNT_COL],
  makeCategoricalRows(["A", "B", "C", "D"]),
);
const stateDataset = makeDataset([STATE_COL, COUNT_COL], [["CA", 10]]);
const timeFacetDataset = makeDataset(
  [CATEGORY_COL, TS_COL, COUNT_COL],
  makeTsRows(4).map((row) => ["A", row[0], row[1]]),
);

/** Small datasets that trigger the row-chart fallback (at or below threshold). */
const smallTsDataset = makeDataset([TS_COL, COUNT_COL], makeTsRows(1));
const smallCategoricalDataset = makeDataset(
  [CATEGORY_COL, COUNT_COL],
  makeCategoricalRows(["A"]),
);
const smallTimeFacetDataset = makeDataset(
  [CATEGORY_COL, TS_COL, COUNT_COL],
  [["A", "2025-01-01", 1]],
);

describe("getHeatMapSeries", () => {
  it("labels the Segment column with the real segment name", () => {
    const { data } = getHeatMapSeries({
      series: [
        makeHeatMapSeries("Revenue by Plan", [["A", 1]]),
        makeHeatMapSeries("Revenue by Plan (Enterprise)", [["A", 2]]),
        makeHeatMapSeries("Revenue by Plan (SMB)", [["A", 3]]),
      ],
      legendItems: [
        { name: "(All)", color: "#509EE3" },
        { name: "Enterprise", color: "#88BF4D" },
        { name: "SMB", color: "#A989C5" },
      ],
    })[0];

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
  function getChartsForDocumentEmbed(
    queries: ExplorationQuery[],
    datasets: Dataset[],
  ) {
    return buildSeriesGroups({
      queries,
      datasets,
      selectedTimelineId: null,
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

  it("omits timeline viz settings on cartesian embeds when no timeline is selected", () => {
    const charts = getChartsForDocumentEmbed(
      [
        makeQuery({ id: 1, name: "Q1", dimension_id: "dim-1" }),
        makeQuery({ id: 2, name: "Q2", dimension_id: "dim-1" }),
      ],
      [tsDataset, tsDataset],
    );

    expect(charts).toHaveLength(1);
    expect(
      charts[0].visualization_settings["timeline.selected_timeline_ids"],
    ).toBeUndefined();
  });

  it("includes segment names and colors in series_settings on multi-series cartesian embeds", () => {
    const charts = getChartsForDocumentEmbed(
      [
        makeQuery({
          id: 1,
          name: "Q1",
          dimension_id: "dim-1",
          segment_id: 1,
          segment_name: "US",
        }),
        makeQuery({
          id: 2,
          name: "Q2",
          dimension_id: "dim-1",
          segment_id: 2,
          segment_name: "EU",
        }),
      ],
      [tsDataset, tsDataset],
    );

    expect(charts).toHaveLength(1);
    const seriesSettings =
      charts[0].visualization_settings.series_settings ?? {};
    const settings = Object.values(seriesSettings);
    expect(settings.map((s) => s?.title)).toEqual(["US", "EU"]);
    expect(settings.every((s) => s?.color)).toBe(true);
    expect(new Set(settings.map((s) => s?.color)).size).toBe(2);
  });

  it("includes selected timeline ids on cartesian embeds", () => {
    const charts = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, name: "Q1", dimension_id: "dim-1" }),
        makeQuery({ id: 2, name: "Q2", dimension_id: "dim-1" }),
      ],
      datasets: [tsDataset, tsDataset],
      selectedTimelineId: 42,
    }).chartsForDocumentEmbed;

    expect(charts).toHaveLength(1);
    expect(
      charts[0].visualization_settings["timeline.selected_timeline_ids"],
    ).toEqual([42]);
  });
});

describe("buildSeries (display selection)", () => {
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
    return buildSeriesGroup({
      queriesWithDatasets: group,
      selectedTimelineId: null,
    });
  }

  it("disables cartesian axis labels by default", () => {
    const query = makeQuery({ id: 1 });
    const group = buildOneSeries(query, tsDataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(false);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("enables the x-axis label for the 3-column time-facet shape", () => {
    const query = makeQuery({ id: 1, query_type: "time-facet" });
    const group = buildOneSeries(query, timeFacetDataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(true);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("picks line with split panels for a 2-column timeseries dataset", () => {
    const query = makeQuery({ id: 1 });
    const group = buildOneSeries(query, tsDataset);
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
    const group = buildOneSeries(query, categoricalDataset);
    expect(group.series[0].card.display).toBe("bar");
    // No category color map was supplied (buildSeriesGroup called without
    // `categoryColors`), so the bar keeps default coloring — a strict no-op.
    expect(
      group.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ],
    ).toBeUndefined();
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
    const group = buildSeriesGroup({
      queriesWithDatasets: queries.map((q) => ({ ...q, dataset: categorical })),
      selectedTimelineId: null,
    });
    expect(group.series[0].card.display).toBe("table");
  });

  it("assigns distinct map color ramps per segment name", () => {
    const group = buildSeriesGroup({
      queriesWithDatasets: [
        {
          ...makeQuery({ id: 1, segment_id: 1, segment_name: "US" }),
          dataset: stateDataset,
        },
        {
          ...makeQuery({ id: 2, segment_id: 2, segment_name: "EU" }),
          dataset: stateDataset,
        },
      ],
      selectedTimelineId: null,
    });
    const ramp1 = group.series[0].card.visualization_settings["map.colors"];
    const ramp2 = group.series[1].card.visualization_settings["map.colors"];
    expect(ramp1?.[0]).not.toEqual(ramp2?.[0]);
    expect(group.legendItems.map((item) => item.name)).toEqual(["US", "EU"]);
  });
});

describe("row chart fallback (via buildSeriesGroup)", () => {
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
    return buildSeriesGroup({
      queriesWithDatasets: group,
      selectedTimelineId: null,
    });
  }

  it("falls back to row for a small timeseries dataset", () => {
    const group = buildOneSeries(makeQuery({ id: 1 }), smallTsDataset);
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row for a small categorical bar dataset", () => {
    const group = buildOneSeries(makeQuery({ id: 1 }), smallCategoricalDataset);
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row for a small time-facet dataset (counts unique dates)", () => {
    const group = buildOneSeries(
      makeQuery({ id: 1, query_type: "time-facet" }),
      smallTimeFacetDataset,
    );
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row in document embed charts", () => {
    const charts = buildSeriesGroups({
      queries: [makeQuery({ id: 1, name: "Q1", dimension_id: "dim-1" })],
      datasets: [smallTsDataset],
      selectedTimelineId: null,
    }).chartsForDocumentEmbed;

    expect(charts).toHaveLength(1);
    expect(charts[0].display).toBe("row");
  });
});

describe("buildSeriesGroups", () => {
  it("groups queries by dimension_id and query_type", () => {
    const datasets = [
      tsDataset,
      makeDataset(
        [TS_COL, COUNT_COL],
        makeTsRows(4).map((row) => [row[0], 2]),
      ),
    ];
    const queries = [
      makeQuery({ id: 1, dimension_id: "dim-a" }),
      makeQuery({ id: 2, dimension_id: "dim-b" }),
    ];
    const { seriesGroups } = buildSeriesGroups({
      queries,
      datasets,
      selectedTimelineId: null,
    });
    expect(seriesGroups).toHaveLength(2);
  });

  it('picks "two-small-charts-down" for the temporal pattern trio', () => {
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
      selectedTimelineId: null,
    });
    expect(layoutStrategy).toBe("two-small-charts-down");
  });

  it("assigns chart labels in labeled layouts and disables cartesian axis labels", () => {
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
      selectedTimelineId: null,
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

describe("category color matching (via buildSeriesGroups)", () => {
  const STATE_COL = () =>
    createMockColumn({ name: "state", base_type: "type/Text" });
  const TS_COL = () =>
    createMockColumn({ name: "ts", base_type: "type/DateTime" });
  const COUNT_COL = () =>
    createMockColumn({ name: "count", base_type: "type/Integer" });

  function barAndLineGroups(
    categories: string[],
    { withOverTime = true }: { withOverTime?: boolean } = {},
  ) {
    const barCategories = ensureCategoriesAboveRowFallbackThreshold(categories);
    const barDataset = makeDataset(
      [STATE_COL(), COUNT_COL()],
      barCategories.map((category, index) => [category, (index + 1) * 10]),
    );
    const queries: ExplorationQuery[] = [
      makeQuery({ id: 1, dimension_id: "dim-state", query_type: "default" }),
    ];
    const datasets: Dataset[] = [barDataset];

    if (withOverTime) {
      const lineDataset = makeDataset(
        [STATE_COL(), TS_COL(), COUNT_COL()],
        barCategories.map((category, index) => [
          category,
          `2025-01-${String(index + 1).padStart(2, "0")}`,
          (index + 1) * 2,
        ]),
      );
      queries.push(
        makeQuery({
          id: 2,
          dimension_id: "dim-state",
          query_type: "time-facet",
        }),
      );
      datasets.push(lineDataset);
    }

    const { seriesGroups } = buildSeriesGroups({
      queries,
      datasets,
      selectedTimelineId: null,
    });
    return {
      bar: seriesGroups.find((g) => g.series[0].card.display === "bar"),
      line: seriesGroups.find((g) => g.series[0].card.display === "line"),
      barCategories,
    };
  }

  it("colors bar categories with getColorsForValues, matching the over-time line", () => {
    const { bar, line, barCategories } = barAndLineGroups(["open", "closed"]);
    const expected = getColorsForValues(barCategories);

    const barColors =
      bar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ];
    expect(barColors?.["open"]).toBe(expected["open"]);
    expect(barColors?.["closed"]).toBe(expected["closed"]);

    // The chart stays a single-series bar (no breakout/legend restructuring).
    expect(bar?.series).toHaveLength(1);
    expect(bar?.series[0].card.display).toBe("bar");

    // Over-time line bakes the identical colors into series_settings, so the
    // two charts are color-consistent.
    const lineSettings =
      line?.series[0].card.visualization_settings.series_settings;
    expect(lineSettings?.["open"]?.color).toBe(expected["open"]);
    expect(lineSettings?.["closed"]?.color).toBe(expected["closed"]);
    expect(barColors?.["open"]).toBe(lineSettings?.["open"]?.color);
    expect(barColors?.["closed"]).toBe(lineSettings?.["closed"]?.color);
  });

  it("colors bars from their own values when there is no over-time group", () => {
    const { bar, line, barCategories } = barAndLineGroups(["open", "closed"], {
      withOverTime: false,
    });
    expect(line).toBeUndefined();
    const expected = getColorsForValues(barCategories);
    const barColors =
      bar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ];
    expect(barColors?.["open"]).toBe(expected["open"]);
    expect(barColors?.["closed"]).toBe(expected["closed"]);
  });

  it("colors every category when there are more than 8 (order-based palette)", () => {
    const categories = Array.from({ length: 9 }, (_, i) => `cat-${i}`);
    const { bar } = barAndLineGroups(categories);
    const barColors =
      bar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ];
    for (const c of categories) {
      expect(typeof barColors?.[c]).toBe("string");
    }
  });

  it("keys colors by both raw and formatted values for numeric/null categories", () => {
    const numericCol = () =>
      createMockColumn({ name: "n", base_type: "type/Integer" });
    const barDataset = makeDataset(
      [numericCol(), COUNT_COL()],
      [
        [5, 10],
        [null, 20],
        [7, 30],
        [9, 40],
      ],
    );
    // A numeric bar is colored only with an over-time companion, so include one.
    const lineDataset = makeDataset(
      [numericCol(), TS_COL(), COUNT_COL()],
      [
        [5, "2025-01-01", 1],
        [null, "2025-01-02", 2],
        [7, "2025-01-03", 3],
        [9, "2025-01-04", 4],
      ],
    );
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, dimension_id: "dim-n", query_type: "default" }),
        makeQuery({ id: 2, dimension_id: "dim-n", query_type: "time-facet" }),
      ],
      datasets: [barDataset, lineDataset],
      selectedTimelineId: null,
    });
    const bar = seriesGroups.find((g) => g.series[0].card.display === "bar");
    const barColors =
      bar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ];
    // Raw-string key (what the x-axis value stringifies to) is present.
    expect(typeof barColors?.["5"]).toBe("string");
    expect(typeof barColors?.["null"]).toBe("string");
    // Two distinct categories → two colors.
    expect(new Set(Object.values(barColors ?? {})).size).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("does not recolor multi-segment bar groups (segment coloring is left intact)", () => {
    const categorical = makeDataset([STATE_COL(), COUNT_COL()], [["open", 1]]);
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({
          id: 1,
          dimension_id: "dim-state",
          segment_id: 1,
          segment_name: "US",
        }),
        makeQuery({
          id: 2,
          dimension_id: "dim-state",
          segment_id: 2,
          segment_name: "EU",
        }),
      ],
      datasets: [categorical, categorical],
      selectedTimelineId: null,
    });
    expect(
      seriesGroups[0].series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ],
    ).toBeUndefined();
  });

  it("reorders the over-time series models to the bar's order (end-to-end)", () => {
    const barDataset = makeDataset(
      [STATE_COL(), COUNT_COL()],
      [
        ["a", 1],
        ["b", 2],
        ["c", 3],
        ["d", 4],
      ],
    );
    // The over-time rows present the breakout values in a different order.
    const lineDataset = makeDataset(
      [STATE_COL(), TS_COL(), COUNT_COL()],
      [
        ["c", "2025-01-01", 1],
        ["a", "2025-01-02", 2],
        ["b", "2025-01-03", 3],
        ["d", "2025-01-04", 4],
      ],
    );
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, dimension_id: "dim-state", query_type: "default" }),
        makeQuery({
          id: 2,
          dimension_id: "dim-state",
          query_type: "time-facet",
        }),
      ],
      datasets: [barDataset, lineDataset],
      selectedTimelineId: null,
    });

    const line = seriesGroups.find((g) => g.series[0].card.display === "line");
    const computed = getComputedSettingsForSeries(line?.series);
    const ctx: RenderingContext = {
      getColor: (n) => n,
      measureText: () => 0,
      measureTextHeight: () => 0,
      fontFamily: "",
      theme: DEFAULT_VISUALIZATION_THEME,
    };
    // The chart model sorts its series via `graph.series_order`; assert the
    // resulting series models follow the bar order despite the c/a/b data.
    const model = getCartesianChartModel(line!.series, computed, [], ctx);
    expect(model.seriesModels.map((s) => s.vizSettingsKey)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("derives over-time keys from the breakout's own column (binned dimension)", () => {
    const ratingCol = () =>
      createMockColumn({
        name: "rating",
        base_type: "type/Float",
        binning_info: { binning_strategy: "bin-width", bin_width: 0.75 },
      });
    // Bar rows arrive sorted by metric (desc), NOT by the bin value — the bar
    // chart still renders the numeric x-axis ascending, so the over-time order
    // must follow ascending bins (0, 0.75, 1.5), not this row order.
    const barDataset = makeDataset(
      [ratingCol(), COUNT_COL()],
      [
        [0.75, 99],
        [0, 50],
        [1.5, 10],
        [2.25, 5],
      ],
    );
    const lineDataset = makeDataset(
      [ratingCol(), TS_COL(), COUNT_COL()],
      [
        [1.5, "2025-01-01", 1],
        [0, "2025-01-02", 2],
        [0.75, "2025-01-03", 3],
        [2.25, "2025-01-04", 4],
      ],
    );
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, dimension_id: "dim-rating", query_type: "default" }),
        makeQuery({
          id: 2,
          dimension_id: "dim-rating",
          query_type: "time-facet",
        }),
      ],
      datasets: [barDataset, lineDataset],
      selectedTimelineId: null,
    });

    const bar = seriesGroups.find((g) => g.series[0].card.display === "bar");
    const line = seriesGroups.find((g) => g.series[0].card.display === "line");

    // The over-time series-order keys are the breakout column's OWN formatted
    // values (binned ranges), in the bar's order (0, 0.75, 1.5) — so they match
    // the line's series models even though the bar's x-axis shows plain numbers.
    const lineCol = line!.series[0].data.cols[0];
    const expectedKeys = [0, 0.75, 1.5, 2.25].map((v) =>
      formatBreakoutValue(v, lineCol),
    );
    const order =
      line!.series[0].card.visualization_settings["graph.series_order"];
    expect(order?.map((o) => o.key)).toEqual(expectedKeys);
    expect(order?.every((o) => typeof o.color === "string")).toBe(true);

    // The order survives the full computed-settings pipeline (and therefore
    // reorders the rendered series + legend), in the bar's order.
    const computed = getComputedSettingsForSeries(line!.series);
    expect(computed["graph.series_order"]?.map((o) => o.key)).toEqual(
      expectedKeys,
    );

    // The bar paints each category by raw value with the same color the
    // over-time series uses for that category.
    const barColors =
      bar!.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ];
    expect(barColors?.["0"]).toBe(
      order?.find((o) => o.key === expectedKeys[0])?.color,
    );
    expect(barColors?.["1.5"]).toBe(
      order?.find((o) => o.key === expectedKeys[2])?.color,
    );
    expect(barColors?.["2.25"]).toBe(
      order?.find((o) => o.key === expectedKeys[3])?.color,
    );
  });

  it("does not per-color a standalone binned bar (no over-time companion)", () => {
    const ratingCol = createMockColumn({
      name: "rating",
      base_type: "type/Float",
      binning_info: { binning_strategy: "bin-width", bin_width: 0.75 },
    });
    const barDataset = makeDataset(
      [
        ratingCol,
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      [
        [0, 50],
        [0.75, 99],
        [1.5, 10],
        [2.25, 5],
      ],
    );
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, dimension_id: "dim-rating", query_type: "default" }),
      ],
      datasets: [barDataset],
      selectedTimelineId: null,
    });
    const bar = seriesGroups.find((g) => g.series[0].card.display === "bar");
    expect(bar?.series[0].card.display).toBe("bar");
    expect(
      bar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ],
    ).toBeUndefined();
  });

  it("colors a Top-N bar by the companion region map's choropleth scale", () => {
    const stateGeoCol = () =>
      createMockColumn({
        name: "STATE",
        base_type: "type/Text",
        semantic_type: "type/State",
      });
    const statePlainCol = () =>
      createMockColumn({ name: "State", base_type: "type/Text" });
    const SUM = () =>
      createMockColumn({ name: "sum", base_type: "type/Float" });

    // The map (default geo query) is computed over the full set of states.
    const mapValues = [
      ["TX", 108000],
      ["MN", 65000],
      ["MT", 64000],
      ["CO", 40000],
      ["WI", 20000],
      ["NY", 15000],
    ];
    const mapDataset = makeDataset([stateGeoCol(), SUM()], mapValues);
    // The Top-N bar (plain string state column → renders as bar) shows a subset
    // plus an "(Other)" bucket.
    const topNDataset = makeDataset(
      [statePlainCol(), SUM()],
      [
        ["TX", 108000],
        ["MN", 65000],
        ["CO", 40000],
        ["(Other)", 900000],
      ],
    );
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, dimension_id: "dim-state", query_type: "default" }),
        makeQuery({
          id: 2,
          dimension_id: "dim-state",
          query_type: "top-n-other",
        }),
      ],
      datasets: [mapDataset, topNDataset],
      selectedTimelineId: null,
    });

    const map = seriesGroups.find((g) => g.series[0].card.display === "map");
    const bar = seriesGroups.find((g) => g.series[0].card.display === "bar");
    expect(map).toBeTruthy();

    const barColors =
      bar!.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ];
    // Reproduce the map's exact value→color scale.
    const baseColor = getColorsForValues(["(All)"])["(All)"];
    const { colorScale } = buildColorScale(
      Array.from(new Set(mapValues.map((v) => v[1] as number))),
      getColorplethColorScale(baseColor),
    );
    expect(barColors?.["TX"]).toBe(colorScale(108000));
    expect(barColors?.["MN"]).toBe(colorScale(65000));
    expect(barColors?.["CO"]).toBe(colorScale(40000));
    expect(barColors?.["(Other)"]).toBe(colorScale(900000));
    // Distinct value buckets get distinct colors.
    expect(barColors?.["TX"]).not.toBe(barColors?.["MN"]);
  });

  it("does not color special charts (day-of-week) even sharing a dimension with the default bar", () => {
    const categoryDataset = makeDataset(
      [STATE_COL(), COUNT_COL()],
      [
        ["open", 10],
        ["closed", 20],
        ["pending", 30],
        ["archived", 40],
      ],
    );
    const dayDataset = makeDataset(
      [createMockColumn({ name: "day", base_type: "type/Text" }), COUNT_COL()],
      [
        ["Sunday", 5],
        ["Monday", 6],
        ["Tuesday", 7],
        ["Wednesday", 8],
      ],
    );
    const { seriesGroups } = buildSeriesGroups({
      queries: [
        makeQuery({ id: 1, dimension_id: "dim-state", query_type: "default" }),
        makeQuery({
          id: 2,
          dimension_id: "dim-state",
          query_type: "temporal-pattern-day",
        }),
      ],
      datasets: [categoryDataset, dayDataset],
      selectedTimelineId: null,
    });

    const defaultBar = seriesGroups.find((g) => g.queryType === "default");
    const dayBar = seriesGroups.find(
      (g) => g.queryType === "temporal-pattern-day",
    );
    // Both render as `bar`, but only the `default` one is color-matched.
    expect(dayBar?.series[0].card.display).toBe("bar");
    expect(
      defaultBar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ],
    ).toBeDefined();
    expect(
      dayBar?.series[0].card.visualization_settings[
        "graph._dimension_value_colors"
      ],
    ).toBeUndefined();
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
