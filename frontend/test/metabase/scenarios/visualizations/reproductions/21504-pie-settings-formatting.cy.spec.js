import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 21504", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should format pie chart settings (metabase#21504)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pie",
    });

    cy.findByText("Settings").click();
    cy.findByText("April, 2016").should("be.visible");
  });
});
