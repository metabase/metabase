import type { Advisory } from "metabase-types/api";

import type { AdvisoryFilter } from "./types";
import { filterAdvisories, isAffected, sortAdvisories } from "./utils";

const makeAdvisory = (overrides: Partial<Advisory>): Advisory => ({
  advisory_id: "SA-001",
  title: "Test advisory",
  description: "Test description",
  severity: "medium",
  advisory_url: "https://example.com/advisory",
  remediation: "Upgrade to latest version",
  published_at: "2026-01-01T00:00:00Z",
  match_status: "not_affected",
  last_evaluated_at: null,
  acknowledged_by: null,
  acknowledged_at: null,
  affected_versions: [{ min: "0.45.0", fixed: "0.59.0" }],
  ...overrides,
});

const ALL_PASS_FILTER: AdvisoryFilter = {
  severity: "all",
  status: "all",
  showAcknowledged: true,
};

describe("isAffected", () => {
  it("should return true for active advisories", () => {
    expect(isAffected(makeAdvisory({ match_status: "active" }))).toBe(true);
  });

  it("should return true for error advisories (fail-open)", () => {
    expect(isAffected(makeAdvisory({ match_status: "error" }))).toBe(true);
  });

  it.each(["not_affected", "resolved"] as const)(
    "should return false for %s advisories",
    (status) => {
      expect(isAffected(makeAdvisory({ match_status: status }))).toBe(false);
    },
  );
});

describe("sortAdvisories", () => {
  it("should place affected items before non-affected items", () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "1",
        match_status: "not_affected",
        severity: "critical",
      }),
      makeAdvisory({
        advisory_id: "2",
        match_status: "active",
        severity: "low",
      }),
    ];

    const sorted = sortAdvisories(advisories);
    expect(sorted[0].advisory_id).toBe("2");
    expect(sorted[1].advisory_id).toBe("1");
  });

  it("should sort by severity within the same affected status", () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "low",
        severity: "low",
        match_status: "active",
      }),
      makeAdvisory({
        advisory_id: "critical",
        severity: "critical",
        match_status: "active",
      }),
      makeAdvisory({
        advisory_id: "medium",
        severity: "medium",
        match_status: "active",
      }),
      makeAdvisory({
        advisory_id: "high",
        severity: "high",
        match_status: "active",
      }),
    ];

    const sorted = sortAdvisories(advisories);
    expect(sorted.map((a) => a.advisory_id)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
  });

  it("should sort by published_at descending within the same severity", () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "older",
        severity: "high",
        match_status: "active",
        published_at: "2026-01-01T00:00:00Z",
      }),
      makeAdvisory({
        advisory_id: "newer",
        severity: "high",
        match_status: "active",
        published_at: "2026-03-01T00:00:00Z",
      }),
    ];

    const sorted = sortAdvisories(advisories);
    expect(sorted[0].advisory_id).toBe("newer");
    expect(sorted[1].advisory_id).toBe("older");
  });

  it("should return an empty array when given an empty array", () => {
    expect(sortAdvisories([])).toEqual([]);
  });

  it("should not mutate the original array", () => {
    const advisories = [
      makeAdvisory({ advisory_id: "2", match_status: "active" }),
      makeAdvisory({ advisory_id: "1", match_status: "not_affected" }),
    ];
    const original = [...advisories];

    sortAdvisories(advisories);
    expect(advisories).toEqual(original);
  });
});

describe("filterAdvisories", () => {
  const advisories = [
    makeAdvisory({
      advisory_id: "1",
      severity: "critical",
      match_status: "active",
      acknowledged_at: null,
    }),
    makeAdvisory({
      advisory_id: "2",
      severity: "high",
      match_status: "active",
      acknowledged_at: "2026-03-01T00:00:00Z",
    }),
    makeAdvisory({
      advisory_id: "3",
      severity: "medium",
      match_status: "not_affected",
      acknowledged_at: null,
    }),
    makeAdvisory({
      advisory_id: "4",
      severity: "low",
      match_status: "not_affected",
      acknowledged_at: "2026-02-01T00:00:00Z",
    }),
  ];

  it("should return all advisories when no filters are active", () => {
    const result = filterAdvisories(advisories, ALL_PASS_FILTER);
    expect(result).toHaveLength(4);
  });

  it("should filter by severity", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      severity: "critical",
    });
    expect(result).toHaveLength(1);
    expect(result[0].advisory_id).toBe("1");
  });

  it("should filter by affected status", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      status: "affected",
    });
    expect(result.every((a) => a.match_status === "active")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should filter by not-affected status", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      status: "not-affected",
    });
    expect(result.every((a) => a.match_status !== "active")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should hide acknowledged advisories when showAcknowledged is false", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      showAcknowledged: false,
    });
    expect(result.every((a) => a.acknowledged_at == null)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should combine multiple filters", () => {
    const result = filterAdvisories(advisories, {
      severity: "all",
      status: "affected",
      showAcknowledged: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].advisory_id).toBe("1");
  });
});
