const { extractChangedTimings } = require("./extract-changed-timings");

describe("extractChangedTimings", () => {
  it("should return empty durations when no changes", () => {
    const oldTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2000 },
      ],
    };

    const newTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2000 },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    expect(result.changedTimings.durations).toHaveLength(0);
    expect(result.hasChanges).toBe(false);
  });

  it("should detect new specs", () => {
    const oldTimings = {
      durations: [{ spec: "test1.cy.js", duration: 1000 }],
    };

    const newTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2000 },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    expect(result.changedTimings.durations).toHaveLength(1);
    expect(result.changedTimings.durations[0]).toEqual({
      spec: "test2.cy.js",
      duration: 2000,
    });
    expect(result.hasChanges).toBe(true);
  });

  it("should detect duration changes", () => {
    const oldTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2000 },
      ],
    };

    const newTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2200 },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    expect(result.changedTimings.durations).toHaveLength(1);
    expect(result.changedTimings.durations[0]).toEqual({
      spec: "test2.cy.js",
      duration: 2200,
    });
    expect(result.hasChanges).toBe(true);
  });

  it("should handle missing old timings", () => {
    const oldTimings = { durations: [] };

    const newTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2000 },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    // All timings should be considered "changed" since old timings is empty
    expect(result.changedTimings.durations).toHaveLength(2);
    expect(result.changedTimings.durations).toContainEqual({
      spec: "test1.cy.js",
      duration: 1000,
    });
    expect(result.changedTimings.durations).toContainEqual({
      spec: "test2.cy.js",
      duration: 2000,
    });
    expect(result.hasChanges).toBe(true);
  });

  it("should handle invalid timing entries", () => {
    const oldTimings = {
      durations: [{ spec: "test1.cy.js", duration: 1000 }],
    };

    const newTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: "invalid" },
        { duration: 2000 }, // missing spec
        { spec: "test3.cy.js", duration: 3000 },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    // Only test3.cy.js should be included (new spec with valid data)
    expect(result.changedTimings.durations).toHaveLength(1);
    expect(result.changedTimings.durations[0]).toEqual({
      spec: "test3.cy.js",
      duration: 3000,
    });
    expect(result.hasChanges).toBe(true);
  });

  it("should handle timing data with different specs", () => {
    const oldTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 1000 },
        { spec: "test2.cy.js", duration: 2000 },
      ],
    };

    const newTimings = {
      durations: [
        { spec: "test1.cy.js", duration: 3000 },
        { spec: "test3.cy.js", duration: 1000 },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    expect(result.changedTimings.durations).toHaveLength(2);
    expect(result.changedTimings.durations).toContainEqual({
      spec: "test1.cy.js",
      duration: 3000,
    });
    expect(result.changedTimings.durations).toContainEqual({
      spec: "test3.cy.js",
      duration: 1000,
    });
    expect(result.hasChanges).toBe(true);
  });

  it("should convert cypress-split paths to relative paths", () => {
    const oldTimings = {
      durations: [
        {
          spec: "../test/scenarios/dashboard/dashboard.cy.spec.js",
          duration: 1000,
        },
        {
          spec: "../test/scenarios/admin/databases.cy.spec.js",
          duration: 2000,
        },
      ],
    };

    const newTimings = {
      durations: [
        {
          spec: "e2e/test/scenarios/dashboard/dashboard.cy.spec.js",
          duration: 1200,
        },
        {
          spec: "e2e/test/scenarios/admin/databases.cy.spec.js",
          duration: 2000,
        },
        {
          spec: "e2e/test/scenarios/collections/collections.cy.spec.js",
          duration: 1500,
        },
      ],
    };

    const result = extractChangedTimings({ oldTimings, newTimings });

    expect(result.changedTimings.durations).toHaveLength(2);
    expect(result.changedTimings.durations).toContainEqual({
      spec: "../test/scenarios/dashboard/dashboard.cy.spec.js",
      duration: 1200,
    });
    expect(result.changedTimings.durations).toContainEqual({
      spec: "../test/scenarios/collections/collections.cy.spec.js",
      duration: 1500,
    });
    expect(result.hasChanges).toBe(true);
  });
});
