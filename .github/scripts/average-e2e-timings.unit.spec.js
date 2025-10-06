const { averageTimings } = require("./average-e2e-timings");

describe("averageTimings", () => {
  it("should throw error when given empty array", () => {
    expect(() => averageTimings([])).toThrow("No timing data to process");
  });

  it("should work for n=1", () => {
    const input = [
      {
        durations: [
          { spec: "test1.cy.js", duration: 1000 },
          { spec: "test2.cy.js", duration: 2000 },
        ],
      },
    ];

    const result = averageTimings(input);

    expect(result.durations).toHaveLength(2);
    expect(result.durations).toContainEqual({
      spec: "test1.cy.js",
      duration: 1000,
    });
    expect(result.durations).toContainEqual({
      spec: "test2.cy.js",
      duration: 2000,
    });
  });

  it("should calculate average for multiple specs", () => {
    const input = [
      {
        durations: [
          { spec: "test1.cy.js", duration: 1000 },
          { spec: "test2.cy.js", duration: 2000 },
        ],
      },
      {
        durations: [
          { spec: "test1.cy.js", duration: 2000 },
          { spec: "test2.cy.js", duration: 4000 },
        ],
      },
    ];

    const result = averageTimings(input);

    expect(result.durations).toHaveLength(2);
    expect(result.durations).toContainEqual({
      spec: "test1.cy.js",
      duration: 1500,
    });
    expect(result.durations).toContainEqual({
      spec: "test2.cy.js",
      duration: 3000,
    });
  });

  it("should round averages to nearest integer", () => {
    const input = [
      {
        durations: [{ spec: "test1.cy.js", duration: 1001 }],
      },
      {
        durations: [{ spec: "test1.cy.js", duration: 1002 }],
      },
    ];

    const result = averageTimings(input);

    expect(result.durations[0].duration).toBe(1002);
  });

  it("should ignore invalid entries", () => {
    const input = [
      {
        durations: [
          { spec: "test1.cy.js", duration: 1000 },
          { spec: "test2.cy.js", duration: "invalid" },
          { duration: 2000 }, // missing spec
          { spec: "test3.cy.js", duration: 3000 },
        ],
      },
    ];

    const result = averageTimings(input);

    expect(result.durations).toHaveLength(2);
    expect(result.durations).toContainEqual({
      spec: "test1.cy.js",
      duration: 1000,
    });
    expect(result.durations).toContainEqual({
      spec: "test3.cy.js",
      duration: 3000,
    });
  });

  it("should handle merging different specs", () => {
    const input = [
      {
        durations: [
          { spec: "test1.cy.js", duration: 1000 },
          { spec: "test2.cy.js", duration: 2000 },
        ],
      },
      {
        durations: [
          { spec: "test1.cy.js", duration: 3000 },
          { spec: "test3.cy.js", duration: 1000 },
        ],
      },
    ];

    const result = averageTimings(input);

    expect(result.durations).toHaveLength(3);
    expect(result.durations).toContainEqual({
      spec: "test1.cy.js",
      duration: 2000,
    });
    expect(result.durations).toContainEqual({
      spec: "test2.cy.js",
      duration: 2000,
    });
    expect(result.durations).toContainEqual({
      spec: "test3.cy.js",
      duration: 1000,
    });
  });
});
