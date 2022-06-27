import {
  restore,
  editDashboard,
  setFilter,
  popover,
  visitDashboard,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const baseQuestion = {
  query: { "source-table": PRODUCTS_ID },
};

describe("issue 17212", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(baseQuestion).then(({ body: { id: baseQuestionId } }) => {
      const questionDetails = {
        query: { "source-table": `card__${baseQuestionId}` },
      };

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { card_id, dashboard_id } }) => {
          visitDashboard(dashboard_id);
        },
      );
    });
  });

  it("should be able to add ID dashboard filter to the nested question (metabase#17212)", () => {
    editDashboard();

    setFilter("ID");

    cy.findByText("No valid fields").should("not.exist");

    cy.findByText("Select…").click();
    popover()
      .contains("ID")
      .click();
  });
});
