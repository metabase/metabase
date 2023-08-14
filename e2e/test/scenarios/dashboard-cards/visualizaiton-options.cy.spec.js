import {
  popover,
  restore,
  visitDashboard,
  getDashboardCard,
} from "e2e/support/helpers";

describe("scenarios > dashboard > visualization options", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("column reordering should work (metabase#16229)", () => {
    visitDashboard(1);
    cy.findByLabelText("Edit dashboard").click();
    getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("ID")
        .closest("[data-testid^=draggable-item]")
        .trigger("mousedown", 0, 0, { force: true })
        .trigger("mousemove", 5, 5, { force: true })
        .trigger("mousemove", 0, 100, { force: true })
        .trigger("mouseup", 0, 100, { force: true });

      /**
       * When this issue gets fixed, it should be safe to uncomment the following assertion.
       * It currently doesn't work in UI at all, but Cypress somehow manages to move the "ID" column.
       * However, it leaves an empty column in its place (thus, making it impossible to use this assertion).
       */
      cy.findAllByTestId(/draggable-item/)
        .as("sidebarColumns") // Out of all the columns in the sidebar...
        .first() // ...pick the fist one and make sure it's not "ID" anymore
        .should("contain", "User ID");
    });

    // The table preview should get updated immediately, reflecting the changes in columns ordering.
    cy.get(".Modal")
      .findAllByTestId("column-header")
      .first()
      .contains("User ID");
  });

  it("should refelct column settings accurately when changing (metabase#30966)", () => {
    visitDashboard(1);
    cy.findByLabelText("Edit dashboard").click();
    getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("Subtotal-settings-button").click();
    popover().findByLabelText("Show a mini bar chart").click();
    cy.findAllByTestId("mini-bar").should("have.length.above", 0);
  });
});
