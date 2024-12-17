import { H } from "e2e/support";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard cards > visualization options", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow empty card title (metabase#12013, metabase#36788)", () => {
    const originalCardTitle = "Orders";
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByTestId("legend-caption")
      .should("contain", originalCardTitle)
      .and("be.visible");

    H.editDashboard();
    H.showDashboardCardActions();
    cy.icon("palette").click();

    H.modal().within(() => {
      cy.findByDisplayValue(originalCardTitle).click().clear().blur();
      cy.button("Done").click();
    });

    cy.findByTestId("legend-caption").should("not.contain", originalCardTitle);
    H.saveDashboard();
    H.getDashboardCard().realHover();
    H.getDashboardCardMenu().click();
    H.popover()
      .should("contain", "Edit question")
      .and("contain", "Download results");
  });

  it("column reordering should work (metabase#16229)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByLabelText("Edit dashboard").click();
    H.getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      H.moveDnDKitElement(H.getDraggableElements().contains("ID"), {
        vertical: 100,
      });
      const idButton = cy
        .get('[data-testid="draggable-item-ID"]')
        .closest("[role=button]");
      const userIdButton = cy
        .get('[data-testid="draggable-item-User ID"]')
        .closest("[role=button]");
      // The ID column should be below the User ID column.
      expect(idButton.prev()[0]).to.equal(userIdButton[0]);
    });
    // The table preview should get updated immediately, reflecting the changes in columns ordering.
    H.modal().findAllByTestId("column-header").first().contains("User ID");
  });

  it("should reflect column settings accurately when changing (metabase#30966)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByLabelText("Edit dashboard").click();
    H.getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("Subtotal-settings-button").click();
    H.popover().findByLabelText("Show a mini bar chart").click({ force: true });
    cy.findAllByTestId("mini-bar").should("have.length.above", 0);
  });
});
