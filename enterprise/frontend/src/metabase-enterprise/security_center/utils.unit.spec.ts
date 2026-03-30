import type { Advisory, AdvisoryFilter } from "./types";
import { filterAdvisories, sortAdvisories } from "./utils";

const makeAdvisory = (overrides: Partial<Advisory>): Advisory => ({
  id: "SA-001",
  title: "Test advisory",
  description: "Test description",
  severity: "medium",
  affectedVersionRange: ">=0.45.0 <0.59.0",
  fixedVersion: "v0.59.0",
  publishedAt: "2026-01-01T00:00:00Z",
  advisoryUrl: "https://example.com/advisory",
  upgradeUrl: "https://example.com/upgrade",
  affected: false,
  acknowledged: false,
  ...overrides,
});

const ALL_PASS_FILTER: AdvisoryFilter = {
  severity: "all",
  status: "all",
  showAcknowledged: true,
};

describe("sortAdvisories", () => {
  it("should place affected items before non-affected items", () => {
    const advisories = [
      makeAdvisory({ id: "1", affected: false, severity: "critical" }),
      makeAdvisory({ id: "2", affected: true, severity: "low" }),
    ];

    const sorted = sortAdvisories(advisories);
    expect(sorted[0].id).toBe("2");
    expect(sorted[1].id).toBe("1");
  });

  it("should sort by severity within the same affected status", () => {
    const advisories = [
      makeAdvisory({ id: "low", severity: "low", affected: true }),
      makeAdvisory({ id: "critical", severity: "critical", affected: true }),
      makeAdvisory({ id: "medium", severity: "medium", affected: true }),
      makeAdvisory({ id: "high", severity: "high", affected: true }),
    ];

    const sorted = sortAdvisories(advisories);
    expect(sorted.map((a) => a.id)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
  });

  it("should sort by publishedAt descending within the same severity", () => {
    const advisories = [
      makeAdvisory({
        id: "older",
        severity: "high",
        affected: true,
        publishedAt: "2026-01-01T00:00:00Z",
      }),
      makeAdvisory({
        id: "newer",
        severity: "high",
        affected: true,
        publishedAt: "2026-03-01T00:00:00Z",
      }),
    ];

    const sorted = sortAdvisories(advisories);
    expect(sorted[0].id).toBe("newer");
    expect(sorted[1].id).toBe("older");
  });

  it("should return an empty array when given an empty array", () => {
    expect(sortAdvisories([])).toEqual([]);
  });

  it("should not mutate the original array", () => {
    const advisories = [
      makeAdvisory({ id: "2", affected: true }),
      makeAdvisory({ id: "1", affected: false }),
    ];
    const original = [...advisories];

    sortAdvisories(advisories);
    expect(advisories).toEqual(original);
  });
});

describe("filterAdvisories", () => {
  const advisories = [
    makeAdvisory({
      id: "1",
      severity: "critical",
      affected: true,
      acknowledged: false,
    }),
    makeAdvisory({
      id: "2",
      severity: "high",
      affected: true,
      acknowledged: true,
    }),
    makeAdvisory({
      id: "3",
      severity: "medium",
      affected: false,
      acknowledged: false,
    }),
    makeAdvisory({
      id: "4",
      severity: "low",
      affected: false,
      acknowledged: true,
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
    expect(result[0].id).toBe("1");
  });

  it("should filter by affected status", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      status: "affected",
    });
    expect(result.every((a) => a.affected)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should filter by not-affected status", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      status: "not-affected",
    });
    expect(result.every((a) => !a.affected)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should hide acknowledged advisories when showAcknowledged is false", () => {
    const result = filterAdvisories(advisories, {
      ...ALL_PASS_FILTER,
      showAcknowledged: false,
    });
    expect(result.every((a) => !a.acknowledged)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should combine multiple filters", () => {
    const result = filterAdvisories(advisories, {
      severity: "all",
      status: "affected",
      showAcknowledged: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});
