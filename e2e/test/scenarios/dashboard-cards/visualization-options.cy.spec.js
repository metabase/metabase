import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  editDashboard,
  getDashboardCard,
  getDashboardCardMenu,
  getDraggableElements,
  modal,
  moveDnDKitElement,
  popover,
  restore,
  saveDashboard,
  showDashboardCardActions,
  visitDashboard,
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
      cy.findByDisplayValue(originalCardTitle).click().clear().blur();
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
        vertical: 150,
      });
      const idButton = cy
        .get('[data-testid="draggable-item-ID"]')
        .closest("[role=button]");
      const userIdButton = cy
        .get('[data-testid="draggable-item-User ID"]')
        .closest("[role=button]");
      expect(idButton.prev()[0]).to.equal(userIdButton[0]);
    });
    // The table preview should get updated immediately, reflecting the changes in columns ordering.
    modal().findAllByTestId("column-header").first().contains("User ID");
  });

  it("should reflect column settings accurately when changing (metabase#30966)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByLabelText("Edit dashboard").click();
    getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("Subtotal-settings-button").click();
    popover().findByLabelText("Show a mini bar chart").click();
    cy.findAllByTestId("mini-bar").should("have.length.above", 0);
  });
});
