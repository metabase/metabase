import {
  filter,
  getNotebookStep,
  openOrdersTable,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issue 34794", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when navigating to filter popover's custom expression section (metabase#34794)", () => {
    openOrdersTable({ mode: "notebook" });

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Created At").click();
      cy.icon("chevronleft").click(); // go back to the main filter popover
      cy.findByText("Custom Expression").click();
      cy.findByLabelText("Expression").type("[Total] > 10").blur();
      cy.button("Done").click();
    });

    getNotebookStep("filter")
      .findByText("Total is greater than 10")
      .should("be.visible");
  });
});
