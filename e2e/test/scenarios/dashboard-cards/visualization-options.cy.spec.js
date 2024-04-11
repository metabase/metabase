import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  popover,
  restore,
  visitDashboard,
  getDashboardCard,
  editDashboard,
  showDashboardCardActions,
  modal,
  saveDashboard,
  getDashboardCardMenu,
  getDraggableElements,
  moveDnDKitElement,
} from "e2e/support/helpers";

describe("scenarios > dashboard cards > visualization options", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow empty card title (metabase#12013, metabase#36788)", () => {
    const originalCardTitle = "Orders";
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByTestId("legend-caption")
      .should("contain", originalCardTitle)
      .and("be.visible");

    editDashboard();
    showDashboardCardActions();
    cy.icon("palette").click();

    modal().within(() => {
      cy.findByDisplayValue(originalCardTitle).click().clear();
      cy.button("Done").click();
    });

    cy.findByTestId("legend-caption").should("not.contain", originalCardTitle);
    saveDashboard();
    getDashboardCard().realHover();
    getDashboardCardMenu().click();
    popover()
      .should("contain", "Edit question")
      .and("contain", "Download results");
  });

  it("column reordering should work (metabase#16229)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByLabelText("Edit dashboard").click();
    getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      moveDnDKitElement(getDraggableElements().contains("ID"), {
        vertical: 100,
      });

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
    modal().findAllByTestId("column-header").first().contains("User ID");
  });

  it("should refelct column settings accurately when changing (metabase#30966)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByLabelText("Edit dashboard").click();
    getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("Subtotal-settings-button").click();
    popover().findByLabelText("Show a mini bar chart").click();
    cy.findAllByTestId("mini-bar").should("have.length.above", 0);
  });
});
