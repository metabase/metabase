import type {
  ExplorationQuery,
  ExplorationQueryStatus,
} from "metabase-types/api";

import {
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

  it("returns null when no timeline has scores at all", () => {
    const id = getMostInterestingTimelineId(
      [makeQuery({ id: 1 })],
      new Set([10]),
    );
    expect(id).toBeNull();
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
