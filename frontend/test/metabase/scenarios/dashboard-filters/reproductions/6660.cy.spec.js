import { restore, popover } from "__support__/e2e/cypress";

describe("issue 6660", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show sub-day resolutions in relative date filter (metabase#6660)", () => {
    cy.visit("/dashboard/1");
    cy.icon("pencil").click();
    cy.icon("filter").click();

    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });

    cy.findByText("No default").click();
    // click on Previous, to expand the relative date filter type dropdown
    cy.findByText("Previous").click();
    // choose Next, under which the new options should be available
    cy.findByText("Next").click();
    // click on Days (the default value), which should open the resolution dropdown
    cy.findByText("Days").click();
    // Hours should appear in the selection box (don't click it)
    cy.findByText("Hours");
    // Minutes should appear in the selection box; click it
    cy.findByText("Minutes").click();
    // also check the "Include this minute" checkbox
    // which is actually "Include" followed by "this minute" wrapped in <strong>, so has to be clicked this way
    cy.contains("Include this minute").click();
    // make sure the checkbox was checked
    cy.findByRole("checkbox").should("be.checked");
  });
});
