import { modal, popover, restore, visitQuestion } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;
const EXPRESSION_NAME = "TEST_EXPRESSION";

const question = {
  name: "30905",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      [EXPRESSION_NAME]: ["+", 1, 1],
    },
  },
};

describe("Custom columns visualization settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying visualization settings for a custom column", () => {
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId(`${EXPRESSION_NAME}-settings-button`).click();
    popover().within(() => {
      cy.get("#show_mini_bar").parent().findByRole("switch").click();
    });
    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Save").click();
    });
    modal().within(() => {
      cy.findByText("Save").click();
    });

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Save").should("not.exist");
    });
  });
});
