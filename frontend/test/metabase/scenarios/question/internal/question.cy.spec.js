import { restore, adhocQuestionHash } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

// This is really a test of the QuestionLoader component
// It's used on /_internal/question among other places and loads questions by ID or url hash.
describe("scenarios > internal > question", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should load saved questions", () => {
    cy.server();
    cy.route("POST", `/api/card/1/query`).as("query");
    cy.visit("/_internal/question/1");
    cy.wait("@query");
    cy.findAllByText("37.65"); // some text in the orders table
  });

  it("should load adhoc questions", () => {
    cy.server();
    cy.route("POST", `/api/dataset`).as("dataset");
    const hash = adhocQuestionHash({
      dataset_query: {
        type: "query",
        query: { "source-table": SAMPLE_DATASET.ORDERS_ID },
        database: 1,
      },
      display: "table",
      visualization_settings: {},
    });
    cy.visit("/_internal/question/#" + hash);
    cy.wait("@dataset");
    cy.findAllByText("37.65"); // some text in the orders table
  });
});
