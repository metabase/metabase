import { openQuestionActions, popover, restore } from "e2e/support/helpers";
import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";

describe("issue 21658", function () {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not show other models ID columns as possible PKs", () => {
    cy.createQuestion(
      {
        name: "[Model] Orders",
        dataset: true,
        query: {
          "source-table": SAMPLE_DB_TABLES.STATIC_ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Product ID").click();

    cy.get("#formField-fk_target_field_id")
      .should("have.text", "Products → ID")
      .click();

    popover()
      .findAllByRole("option")
      .each(($option, index) => {
        cy.wrap($option).should("not.contain.text", "[Model]");
      });
  });
});
