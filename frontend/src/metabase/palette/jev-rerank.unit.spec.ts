import type {
  JevRankedItem,
  JevSearchRerankResult,
} from "metabase/api/jev-search";
import { buildCandidatePool } from "metabase/api/jev-search";
import { createMockSearchResult } from "metabase-types/api/mocks";

import {
  applyJevRanking,
  getRecallTerms,
  isJevBestMatch,
  isJevEligibleQuery,
} from "./jev-rerank";

const revenue = createMockSearchResult({
  model: "metric",
  id: 9,
  name: "Revenue",
});
const byState = createMockSearchResult({
  model: "card",
  id: 2,
  name: "Revenue by state",
});
const perQuarter = createMockSearchResult({
  model: "card",
  id: 15,
  name: "Revenue per quarter",
});
const ratings = createMockSearchResult({
  model: "card",
  id: 22,
  name: "Average product rating",
});

const setup = ({
  ranked,
  best = null,
  status = "ok",
}: {
  ranked: JevRankedItem[];
  best?: JevSearchRerankResult["response"]["best"];
  status?: JevSearchRerankResult["response"]["status"];
}): JevSearchRerankResult => ({
  // keyword results: revenue, byState; recall-only extras: perQuarter, ratings
  pool: [revenue, byState, perQuarter, ratings],
  keywordCount: 2,
  response: { status, elapsed_ms: 190, usage: null, ranked, best },
});

const names = (results: { name: string }[] | undefined) =>
  results?.map((result) => result.name);

describe("jev-rerank", () => {
  it("only asks Jev about natural-language queries", () => {
    expect(isJevEligibleQuery("revenue")).toBe(false);
    expect(isJevEligibleQuery("revenue by state")).toBe(true);
    expect(isJevEligibleQuery("  how   much money  ")).toBe(true);
  });

  it("picks the most distinctive words as recall terms", () => {
    expect(getRecallTerms("How much money did we make last quarter?")).toEqual([
      "quarter",
      "money",
    ]);
    expect(getRecallTerms("orders orders by the source")).toEqual([
      "orders",
      "source",
    ]);
  });

  it("builds a de-duplicated pool with keyword results first", () => {
    expect(
      names(
        buildCandidatePool(
          [revenue, byState],
          [[byState, perQuarter], [revenue]],
        ),
      ),
    ).toEqual(["Revenue", "Revenue by state", "Revenue per quarter"]);
  });

  it("reorders by Jev's ranking and pins the best match", () => {
    const ranking = applyJevRanking(
      setup({
        ranked: [
          { model: "card", id: 15, score: 2.96 },
          { model: "metric", id: 9, score: 2.1 },
          { model: "card", id: 2, score: 1.2 },
          { model: "card", id: 22, score: 0.2 },
        ],
        best: { model: "card", id: 15, confidence: 0.92 },
      }),
    );
    expect(names(ranking?.results)).toEqual([
      "Revenue per quarter",
      "Revenue",
      "Revenue by state",
    ]);
    expect(ranking?.best).toEqual({ model: "card", id: 15, confidence: 0.92 });
    expect(ranking?.elapsedMs).toBe(190);
    expect(isJevBestMatch(ranking?.best ?? null, perQuarter)).toBe(true);
    expect(isJevBestMatch(ranking?.best ?? null, revenue)).toBe(false);
  });

  it("never drops keyword results, even low-scored or missing ones", () => {
    const ranking = applyJevRanking(
      setup({ ranked: [{ model: "card", id: 22, score: 2.5 }] }),
    );
    expect(names(ranking?.results)).toEqual([
      "Average product rating",
      "Revenue",
      "Revenue by state",
    ]);
    expect(ranking?.best).toBeNull();
  });

  it("ignores ids that were not in the pool", () => {
    const ranking = applyJevRanking(
      setup({
        ranked: [
          { model: "card", id: 999, score: 3 },
          { model: "metric", id: 9, score: 2 },
          { model: "card", id: 2, score: 1 },
        ],
        best: { model: "card", id: 999, confidence: 1 },
      }),
    );
    expect(names(ranking?.results)).toEqual(["Revenue", "Revenue by state"]);
    expect(ranking?.best).toBeNull();
  });

  it("returns null when Jev is unavailable so keyword order stands", () => {
    expect(
      applyJevRanking(setup({ ranked: [], status: "unavailable" })),
    ).toBeNull();
  });
});
