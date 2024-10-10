import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, restore } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 47058", () => {
  it("should show the loading page while the question metadata is being fetched (metabase#47058)", () => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/card/*/query_metadata").as("metadata");

    createQuestion({
      name: "Metric 47058",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    }).then(({ body: { id: metricId } }) => {
      createQuestion({
        name: "Question 47058",
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          fields: [
            ["field", ORDERS.ID, {}],
            ["field", ORDERS.TOTAL, {}],
          ],
          aggregation: [["metric", metricId]],
          limit: 1,
        },
      }).then(({ body: { id: questionId, name } }) => {
        cy.visit(`/question/${questionId}/notebook`);

        cy.findByText("Loading...").should("be.visible");
        cy.findByText(name).should("not.exist");

        // Only render the notebook editor after the metadata is loaded
        cy.wait("@metadata");
        cy.findByText("Loading...").should("not.exist");
        cy.findByText(name).should("be.visible");
      });
    });
  });
});
