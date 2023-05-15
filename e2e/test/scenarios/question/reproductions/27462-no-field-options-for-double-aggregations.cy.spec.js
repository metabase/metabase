import { visitQuestionAdhoc, restore, popover } from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("issue 27462", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to select field when double aggregating metabase#27462", () => {
    const questionDetails = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      display: "table",
      visualization_settings: {},
    };

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });

    cy.button("Summarize").click();

    cy.findByRole("option", { name: "Sum of ..." }).click();

    popover().within(() => {
      cy.findByRole("option", { name: "Count" }).click();
    });

    cy.button("Visualize").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("200").should("be.visible");
  });
});
