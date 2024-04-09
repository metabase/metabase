import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { appBar, main, popover, restore } from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

// Should be removed once proper model FK support is implemented
describe("issue 31663", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/idfields`).as(
      "idFields",
    );

    cy.createQuestion(
      {
        name: "Products Model",
        type: "model",
        query: { "source-table": PRODUCTS_ID },
      },
      { visitQuestion: true },
    );
  });

  it("shouldn't list model IDs as possible model FK targets (metabase#31663)", () => {
    // It's important to have product model's metadata loaded to reproduce this
    appBar().findByText("Our analytics").click();

    main().findByText("Orders Model").click();
    cy.wait("@dataset");
    cy.findByLabelText("Move, archive, and more...").click();
    popover().findByText("Edit metadata").click();

    cy.findByTestId("TableInteractive-root").findByText("Product ID").click();
    cy.wait("@idFields");
    cy.findByLabelText("Foreign key target").click();
    popover().within(() => {
      cy.findByText("Orders Model → ID").should("not.exist");
      cy.findByText("Products Model → ID").should("not.exist");

      cy.findByText("Orders → ID").should("exist");
      cy.findByText("People → ID").should("exist");
      cy.findByText("Products → ID").should("exist");
      cy.findByText("Reviews → ID").should("exist");
    });
  });
});
