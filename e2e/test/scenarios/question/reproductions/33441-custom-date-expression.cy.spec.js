import {
  addCustomColumn,
  enterCustomColumnDetails,
  openOrdersTable,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issue 33441", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message for an incorrect date expression (metabase#33441)", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    enterCustomColumnDetails({
      formula: 'datetimeDiff([Created At] , now, "days")',
      name: "Date",
    });
    popover().within(() => {
      cy.findByText("Invalid expression").should("be.visible");
      cy.button("Done").should("be.disabled");
    });
  });
});
