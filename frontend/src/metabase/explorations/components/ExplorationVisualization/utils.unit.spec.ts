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

import {
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
