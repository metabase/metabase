import { restore, popover, visitDashboard } from "__support__/e2e/helpers";

describe("issue 6660", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show sub-day resolutions in relative date filter (metabase#6660)", () => {
    visitDashboard(1);
    cy.icon("pencil").click();
    cy.icon("filter").click();

    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });

    cy.findByText("No default").click();
    // click on Relative dates..., to open the relative date filter type tabs
    cy.findByText("Relative dates...").click();
    // choose Next, under which the new options should be available
    cy.findByText("Next").click();
    // click on Days (the default value), which should open the resolution dropdown
    cy.findByText("days").click();
    // Hours should appear in the selection box (don't click it)
    cy.findByText("hours");
    // Minutes should appear in the selection box; click it
    cy.findByText("minutes").click();
    // also check the "Include this minute" checkbox
    // which is actually "Include" followed by "this minute" wrapped in <strong>, so has to be clicked this way
    cy.icon("ellipsis").click();
    cy.contains("Include this minute").click();
  });
});
