import {
  restore,
  editDashboard,
  setFilter,
  popover,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS_ID } = SAMPLE_DATASET;

const baseQuestion = {
  query: { "source-table": PRODUCTS_ID },
};

describe.skip("issue 17212", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(baseQuestion).then(({ body: { id: baseQuestionId } }) => {
      const questionDetails = {
        query: { "source-table": `card__${baseQuestionId}` },
      };

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { card_id, dashboard_id } }) => {
          cy.intercept(
            "POST",
            `/api/dashboard/${dashboard_id}/card/${card_id}/query`,
          ).as("cardQuery");

          cy.visit(`/dashboard/${dashboard_id}`);

          cy.wait("@cardQuery");
        },
      );
    });
  });

  it("should be able to add ID dashboard filter to the nested question (metabase#17212)", () => {
    editDashboard();

    setFilter("ID");

    cy.findByText("No valid fields").should("not.exist");

    cy.findByText("Column to filter on")
      .next("a")
      .click();

    popover()
      .contains("ID")
      .click();
  });
});
