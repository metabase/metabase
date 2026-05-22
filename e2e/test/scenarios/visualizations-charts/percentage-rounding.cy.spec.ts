const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

// Regression coverage for UXW-2852: percentages of a total are reconciled with
// the largest-remainder method so the displayed parts sum to exactly 100%.
//
// The shared data uses values 1 / 2 / 10 (total 13). Independent rounding to two
// decimals gives 7.69 / 15.38 / 76.92 = 99.99%. The middle bucket has the unique
// largest remainder, so reconciliation deterministically bumps it to 15.39,
// making the parts sum to 100.00% (no reliance on tie-break ordering).
describe("scenarios > visualizations > percentage rounding (UXW-2852)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("pie chart", () => {
    const PIE_QUERY = `
      SELECT 'Alpha' AS category, 1 AS n
      UNION ALL SELECT 'Beta', 2
      UNION ALL SELECT 'Gamma', 10
    `;

    beforeEach(() => {
      H.visitQuestionAdhoc({
        display: "pie",
        dataset_query: {
          type: "native",
          native: { query: PIE_QUERY },
          database: SAMPLE_DB_ID,
        },
        visualization_settings: {
          "pie.percent_visibility": "legend",
          "pie.decimal_places": 2,
          "pie.show_labels": true,
        },
      });
    });

    it("reconciles the legend percentages to exactly 100%", () => {
      cy.findByTestId("chart-legend").within(() => {
        cy.findByTestId("legend-item-Alpha").findByText("7.69%");
        // bumped from 15.38% so the legend sums to exactly 100%
        cy.findByTestId("legend-item-Beta").findByText("15.39%");
        cy.findByTestId("legend-item-Gamma").findByText("76.92%");
      });
    });

    it("reconciles the tooltip percentages to exactly 100%", () => {
      // Lets the chart settle to its final size before hovering.
      H.echartsTriggerBlur();
      H.echartsContainer().findByText("Gamma").realHover();

      H.assertEChartsTooltip({
        header: null,
        rows: [
          { name: "Alpha", value: "1", secondaryValue: "7.69 %" },
          { name: "Beta", value: "2", secondaryValue: "15.39 %" },
          { name: "Gamma", value: "10", secondaryValue: "76.92 %" },
        ],
        footer: { name: "Total", value: "13", secondaryValue: "100 %" },
        blurAfter: false,
      });
    });
  });

  describe("stacked bar chart", () => {
    const BAR_QUERY = `
      SELECT 'Q1' AS period, 'Alpha' AS category, 1 AS v
      UNION ALL SELECT 'Q1', 'Beta', 2
      UNION ALL SELECT 'Q1', 'Gamma', 10
    `;

    it("reconciles the stacked segment percentages to exactly 100%", () => {
      H.createNativeQuestion(
        {
          name: "Stacked rounding",
          native: { query: BAR_QUERY },
          display: "bar",
          visualization_settings: {
            "graph.dimensions": ["PERIOD", "CATEGORY"],
            "graph.metrics": ["V"],
            "stackable.stack_type": "stacked",
            // Pin colors so we can reliably hover a specific segment.
            series_settings: {
              Alpha: { color: "#88BF4D" },
              Beta: { color: "#A989C5" },
              Gamma: { color: "#509EE3" },
            },
          },
        },
        { visitQuestion: true },
      );

      // Hovering any segment shows the whole stack's breakdown.
      H.echartsTriggerBlur();
      H.chartPathWithFillColor("#A989C5").realHover();

      H.assertEChartsTooltip({
        header: null,
        rows: [
          {
            color: "#88BF4D",
            name: "Alpha",
            value: "1",
            secondaryValue: "7.69 %",
          },
          {
            color: "#A989C5",
            name: "Beta",
            value: "2",
            secondaryValue: "15.39 %",
          },
          {
            color: "#509EE3",
            name: "Gamma",
            value: "10",
            secondaryValue: "76.92 %",
          },
          { name: "Total", value: "13", secondaryValue: "100 %" },
        ],
        footer: null,
        blurAfter: false,
      });
    });
  });

  describe("sankey chart", () => {
    // A straight Source -> Hub -> Out chain. "Hub" receives 300 but only sends
    // on 200 (100 lost), so its single outgoing link is 66.67% of the node —
    // not a whole. Reconciliation must NOT force it to 100%.
    const SANKEY_LOSS_QUERY = `
      SELECT 'Source' AS source, 'Hub' AS target, 300 AS metric
      UNION ALL SELECT 'Hub', 'Out', 200
    `;

    it("leaves a flow-loss node's percentage unreconciled", () => {
      H.createNativeQuestion(
        {
          name: "Sankey flow loss",
          native: { query: SANKEY_LOSS_QUERY },
          display: "sankey",
          // Gray edges share one color so we can pick by index; the chain has
          // two straight segments, both reliably hoverable.
          visualization_settings: { "sankey.edge_color": "gray" },
        },
        { visitQuestion: true },
      );

      // Second segment is Hub -> Out; its tooltip shows Hub's outgoing breakdown.
      H.echartsTriggerBlur();
      H.sankeyEdge("#81898e").eq(1).realHover();

      H.assertEChartsTooltip({
        header: "Hub → Out",
        rows: [
          // 200 / 300 = 66.67%; left as-is, NOT forced to 100%, because a
          // flow-loss node's outgoing total isn't a whole.
          { name: "Out", value: "200", secondaryValue: "66.67 %" },
        ],
        // Footer is hardcoded to 100% even on loss (pre-existing behavior).
        footer: { name: "Total", value: "300", secondaryValue: "100 %" },
        blurAfter: false,
      });
    });
  });
});
