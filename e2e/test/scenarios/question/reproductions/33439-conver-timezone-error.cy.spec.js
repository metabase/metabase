import {
  addCustomColumn,
  enterCustomColumnDetails,
  openOrdersTable,
  popover,
  restore,
} from "e2e/support/helpers";

describe("issue 33439", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should show an error message when trying to use convertTimezone on an unsupported db (metabase#33439)", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    enterCustomColumnDetails({
      formula:
        'convertTimezone("2022-12-28T12:00:00", "Canada/Pacific", "Canada/Eastern")',
      name: "Date",
    });
    popover().within(() => {
      cy.findByText("Unsupported function convert-timezone");
      cy.button("Done").should("be.disabled");
    });
  });
});
