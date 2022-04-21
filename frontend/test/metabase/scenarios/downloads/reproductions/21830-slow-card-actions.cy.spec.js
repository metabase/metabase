import {
  editDashboard,
  getDashboardCard,
  restore,
  showDashboardCardActions,
  visitDashboard,
} from "__support__/e2e/cypress";

describe("issue 21830", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", {
      delay: 10000,
    });
  });

  it("should hide card actions when the card is loading (metabase#21830)", () => {
    visitDashboard(1);
    editDashboard();
    showDashboardCardActions(0);

    getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("not.exist");
      cy.icon("palette").should("not.exist");
    });
  });
});
