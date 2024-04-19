import { openPeopleTable, popover, restore } from "e2e/support/helpers";

describe("scenarios > visualizations > drillthroughs > table_drills > combine columns", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be possible to combine columns from the a table header", () => {
    openPeopleTable({ limit: 3, mode: "notebook" });

    cy.findByLabelText("Pick columns").click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByLabelText("Email").click();
    });

    cy.findByLabelText("Pick columns").click();
    cy.button("Visualize").click();

    cy.findAllByTestId("header-cell").contains("Email").click();
    popover().findByText("Combine columns").click();

    popover().within(() => {
      cy.findByTestId("combine-column-example").should(
        "contain",
        "email@example.com12345",
      );
      cy.findByText("ID").click();
    });

    popover()
      .last()
      .within(() => {
        cy.findByText("Name").click();
      });

    popover().within(() => {
      cy.findByText("Separated by (empty)").click();
      cy.findByLabelText("Separator").type("__");
      cy.findByTestId("combine-column-example").should(
        "contain",
        "email@example.com__text",
      );

      cy.findByText("Add column").click();
      cy.findByTestId("combine-column-example").should(
        "contain",
        "email@example.com__text__12345",
      );

      cy.findAllByRole("textbox").last().clear();
      cy.findByTestId("combine-column-example").should(
        "contain",
        "email@example.com__text12345",
      );

      cy.findAllByRole("textbox").last().clear().type("+");
      cy.findByTestId("combine-column-example").should(
        "contain",
        "email@example.com__text+12345",
      );

      cy.findByText("Done").click();
    });

    cy.findAllByTestId("header-cell").last().should("contain", "Email Name ID");
  });
});
