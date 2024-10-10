import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, restore } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 47058", () => {
  it("should show the loading page while the question metadata is being fetched (metabase#47058)", () => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/card/*/query_metadata", req =>
      req.continue(() => new Promise(resolve => setTimeout(resolve, 1000))),
    ).as("metadata");

    createQuestion({
      name: "Metric 47058",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    }).then(({ body: { id: metricId, name: metricName } }) => {
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
      }).then(({ body: { id: questionId } }) => {
        cy.visit(`/question/${questionId}/notebook`);

        cy.findByText("Loading...").should("be.visible");
        cy.findByText(metricName).should("not.exist");
        cy.findByText("[Unknown Metric]").should("not.exist");

        cy.wait("@metadata");
        cy.log(
          "Only renders the notebook editor (with the summarize button that has the metrics' name on it) after the metadata is loaded",
        );

        cy.findByText("Loading...").should("not.exist");
        cy.findByText("[Unknown Metric]").should("not.exist");
        cy.findByText(metricName).should("be.visible");
      });
    });
  });
});
