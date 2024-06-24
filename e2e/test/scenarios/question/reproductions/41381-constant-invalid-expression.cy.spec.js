import {
  addCustomColumn,
  enterCustomColumnDetails,
  openOrdersTable,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issue 41381", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message when adding a constant-only custom expression (metabase#41381)", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    enterCustomColumnDetails({ formula: "'Test'", name: "Constant" });
    popover().within(() => {
      cy.findByText("Invalid expression").should("be.visible");
      cy.button("Done").should("be.disabled");
    });
  });
});
