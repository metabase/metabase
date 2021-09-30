import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";

describe("visual tests > visualizations > bar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
  });

  it("with stacked series", () => {
    const testQuery = {
      type: "native",
      native: {
        query:
          "SELECT X, A, B, C " +
          "FROM (VALUES (1,20,30,30),(2,10,-40,-20),(3,20,10,30)) T (X, A, B, C)",
      },
      database: 1,
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

    cy.wait("@dataset");

    cy.percySnapshot();
  });

  it("with an invalid SQL query and a long error message", () => {
    const testQuery = {
      type: "native",
      native: {
        query: Array(50)
          .fill("SELECT A, B, C FROM EXAMPLE")
          .join("UNION ALL"),
      },
      database: 1,
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

    cy.wait("@dataset");

    cy.percySnapshot();
  });
});
