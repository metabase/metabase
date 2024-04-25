import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  ensureDcChartVisibility,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("visual tests > visualizations > bar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("with stacked series", () => {
    const testQuery = {
      type: "native",
      native: {
        query:
          "SELECT X, A, B, C " +
          "FROM (VALUES (1,20,30,30),(2,10,-40,-20),(3,20,10,30)) T (X, A, B, C)",
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["A", "B", "C"],
        "stackable.stack_type": "stacked",
      },
    });

    ensureDcChartVisibility();
    cy.createPercySnapshot();
  });

  it("with stack-100% series and showing trend line", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"], ["avg", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "bar",
      visualization_settings: {
        "graph.show_trendline": true,
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg", "count"],
        "stackable.stack_type": "normalized",
      },
    });

    ensureDcChartVisibility();
    cy.createPercySnapshot();
  });

  it("with an invalid SQL query and a long error message", () => {
    const testQuery = {
      type: "native",
      native: {
        query: Array(50)
          .fill("SELECT A, B, C FROM EXAMPLE")
          .join(" UNION ALL\n"),
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["A", "B", "C"],
        "stackable.stack_type": "stacked",
      },
    });

    cy.createPercySnapshot();
  });
});
