import type { SelectedMetric } from "../../types/viewer-state";

import {
  filterSearchResults,
  getSelectedMeasureIds,
  getSelectedMetricIds,
} from "./utils";

function makeSelectedMetric(
  overrides: Partial<SelectedMetric> &
    Pick<SelectedMetric, "id" | "sourceType">,
): SelectedMetric {
  return { name: "Test", ...overrides };
}

function makeSearchResult(id: number, model: "metric" | "measure") {
  return { id, model, name: `Result ${id}` };
}

describe("getSelectedMetricIds", () => {
  it("returns Set of IDs for metrics only", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "metric" }),
      makeSelectedMetric({ id: 2, sourceType: "measure" }),
      makeSelectedMetric({ id: 3, sourceType: "metric" }),
    ];
    const result = getSelectedMetricIds(selected);
    expect(result).toEqual(new Set([1, 3]));
  });

  it("returns empty Set for empty array", () => {
    expect(getSelectedMetricIds([])).toEqual(new Set());
  });

  it("returns empty Set when no metrics exist", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "measure" }),
    ];
    expect(getSelectedMetricIds(selected)).toEqual(new Set());
  });
});

describe("getSelectedMeasureIds", () => {
  it("returns Set of IDs for measures only", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "metric" }),
      makeSelectedMetric({ id: 2, sourceType: "measure" }),
      makeSelectedMetric({ id: 5, sourceType: "measure" }),
    ];
    const result = getSelectedMeasureIds(selected);
    expect(result).toEqual(new Set([2, 5]));
  });

  it("returns empty Set for empty array", () => {
    expect(getSelectedMeasureIds([])).toEqual(new Set());
  });

  it("returns empty Set when no measures exist", () => {
    const selected: SelectedMetric[] = [
      makeSelectedMetric({ id: 1, sourceType: "metric" }),
    ];
    expect(getSelectedMeasureIds(selected)).toEqual(new Set());
  });
});

describe("filterSearchResults", () => {
  const results = [
    makeSearchResult(1, "metric"),
    makeSearchResult(2, "metric"),
    makeSearchResult(10, "measure"),
    makeSearchResult(20, "measure"),
  ];

  it("excludes already-selected metrics by ID", () => {
    const filtered = filterSearchResults(results, new Set([1]), new Set());
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 2, model: "metric" },
      { id: 10, model: "measure" },
      { id: 20, model: "measure" },
    ]);
  });

  it("excludes already-selected measures by ID", () => {
    const filtered = filterSearchResults(results, new Set(), new Set([10, 20]));
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 1, model: "metric" },
      { id: 2, model: "metric" },
    ]);
  });

  it("excludes the excludeMetric param", () => {
    const filtered = filterSearchResults(results, new Set(), new Set(), {
      id: 2,
      sourceType: "metric",
    });
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 1, model: "metric" },
      { id: 10, model: "measure" },
      { id: 20, model: "measure" },
    ]);
  });

  it("excludeMetric only matches same model type", () => {
    const filtered = filterSearchResults(results, new Set(), new Set(), {
      id: 1,
      sourceType: "measure",
    });
    expect(filtered).toHaveLength(4);
  });

  it("handles empty results", () => {
    const filtered = filterSearchResults([], new Set([1]), new Set([2]));
    expect(filtered).toEqual([]);
  });

  it("combines all exclusion criteria", () => {
    const filtered = filterSearchResults(results, new Set([1]), new Set([10]), {
      id: 2,
      sourceType: "metric",
    });
    expect(filtered.map((r) => ({ id: r.id, model: r.model }))).toEqual([
      { id: 20, model: "measure" },
    ]);
  });
});
