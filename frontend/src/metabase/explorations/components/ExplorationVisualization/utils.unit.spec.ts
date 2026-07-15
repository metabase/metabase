import { createQuery } from "metabase/explorations/test-utils";
import { registerVisualizations } from "metabase/visualizations/register";
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
  getHeatMapSeries,
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

function buildSeriesGroupFor(query: ExplorationQuery, dataset: Dataset) {
  return buildSeriesGroup({
    queriesWithDatasets: [{ ...query, dataset }],
    selectedTimelineId: null,
  });
}

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

describe("buildSeriesGroup", () => {
  it("disables cartesian axis labels by default", () => {
    const query = makeQuery({ id: 1 });
    const group = buildSeriesGroupFor(query, tsDataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(false);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("enables the x-axis label for the 3-column time-facet shape", () => {
    const query = makeQuery({ id: 1, query_type: "time-facet" });
    const group = buildSeriesGroupFor(query, timeFacetDataset);
    const settings = group.series[0].card.visualization_settings;
    expect(settings["graph.x_axis.labels_enabled"]).toBe(true);
    expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
  });

  it("picks line with split panels for a 2-column timeseries dataset", () => {
    const query = makeQuery({ id: 1 });
    const group = buildSeriesGroupFor(query, tsDataset);
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
    const group = buildSeriesGroupFor(query, dataset);
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
    const group = buildSeriesGroupFor(query, dataset);
    expect(group.series[0].card.display).toBe("map");
    expect(group.series[0].card.visualization_settings["map.region"]).toBe(
      "world_countries",
    );
  });

  it("picks bar for a 2-column categorical dataset", () => {
    const query = makeQuery({ id: 1 });
    const group = buildSeriesGroupFor(query, categoricalDataset);
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

  it("falls back to row for a small timeseries dataset", () => {
    const group = buildSeriesGroupFor(makeQuery({ id: 1 }), smallTsDataset);
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row for a small categorical bar dataset", () => {
    const group = buildSeriesGroupFor(
      makeQuery({ id: 1 }),
      smallCategoricalDataset,
    );
    expect(group.series[0].card.display).toBe("row");
  });

  it("falls back to row for a small time-facet dataset (counts unique dates)", () => {
    const group = buildSeriesGroupFor(
      makeQuery({ id: 1, query_type: "time-facet" }),
      smallTimeFacetDataset,
    );
    expect(group.series[0].card.display).toBe("row");
  });
});
