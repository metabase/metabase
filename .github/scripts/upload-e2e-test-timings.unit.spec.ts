import { buildTestTimingsRow } from "./upload-e2e-test-timings";

const timestamp = "2026-06-30T00:00:00.000Z";

describe("buildTestTimingsRow", () => {
  it("summarizes spec durations", () => {
    const row = buildTestTimingsRow(timestamp, {
      durations: [
        { spec: "a.cy.spec.js", duration: 1000 },
        { spec: "b.cy.spec.js", duration: 3000 },
        { spec: "c.cy.spec.js", duration: 2000 },
      ],
    });

    expect(row).toEqual({
      date: timestamp,
      spec_count: 3,
      total_runtime: 6000,
      avg_spec_runtime: 2000,
      max_spec_runtime: 3000,
    });
  });

  it("rounds the average runtime", () => {
    const row = buildTestTimingsRow(timestamp, {
      durations: [
        { spec: "a.cy.spec.js", duration: 1000 },
        { spec: "b.cy.spec.js", duration: 1001 },
      ],
    });

    expect(row.avg_spec_runtime).toBe(1001);
  });

  it("counts specs with a non-numeric duration but ignores their value", () => {
    const row = buildTestTimingsRow(timestamp, {
      durations: [
        { spec: "a.cy.spec.js", duration: 1000 },
        { spec: "b.cy.spec.js", duration: null },
        { spec: "c.cy.spec.js" },
      ],
    });

    expect(row).toEqual({
      date: timestamp,
      spec_count: 3,
      total_runtime: 1000,
      avg_spec_runtime: 333,
      max_spec_runtime: 1000,
    });
  });

  it("throws when there are no durations", () => {
    expect(() => buildTestTimingsRow(timestamp, { durations: [] })).toThrow(
      "No durations found.",
    );
    expect(() => buildTestTimingsRow(timestamp, {})).toThrow(
      "No durations found.",
    );
  });
});
