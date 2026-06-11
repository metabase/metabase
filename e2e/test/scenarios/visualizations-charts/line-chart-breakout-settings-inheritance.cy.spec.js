const { H } = cy;

const nativeQuery = `
  SELECT DATE '2024-01-01' AS x, 'A' AS category, 10 AS v UNION ALL
  SELECT DATE '2024-02-01', 'A', 20 UNION ALL
  SELECT DATE '2024-02-01', 'B', 30 UNION ALL
  SELECT DATE '2024-03-01', 'B', 40
`;

const breakoutQuestion = (visualization_settings) => ({
  name: "10507 breakout chart",
  native: { query: nativeQuery },
  display: "line",
  visualization_settings: {
    "graph.dimensions": ["X", "CATEGORY"],
    "graph.metrics": ["V"],
    ...visualization_settings,
  },
});

describe("scenarios > visualizations > line chart breakout settings inheritance (metabase#10507)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should zero-fill every breakout series when chart-level line.missing is 'zero' and no per-series override is set", () => {
    H.createNativeQuestion(breakoutQuestion({ "line.missing": "zero" }), {
      visitQuestion: true,
    });

    // Two series x three months = 6 plotted points. With chart-level
    // line.missing="zero" inherited by every series, the missing buckets
    // are filled with zero rather than dropped.
    H.cartesianChartCircle().should("have.length", 6);
  });

  it("should let a per-series line.missing override win over the chart-level value", () => {
    H.createNativeQuestion(
      breakoutQuestion({
        "line.missing": "zero",
        series_settings: { B: { "line.missing": "none" } },
      }),
      { visitQuestion: true },
    );

    // Series A still zero-fills (3 points). Series B keeps its gap and
    // only renders the 2 buckets it has rows for.
    H.cartesianChartCircle().should("have.length", 5);
  });

  it("should leave every breakout series gapped when neither chart-level nor per-series line.missing is set", () => {
    H.createNativeQuestion(breakoutQuestion({}), { visitQuestion: true });

    // With no override the default is "interpolate": only the rows that
    // actually exist render as points (2 + 2 = 4), and echarts connects
    // them across the missing buckets.
    H.cartesianChartCircle().should("have.length", 4);
  });
});
