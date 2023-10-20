import {
  createTextCard,
  getDashboardCardMenu,
  restore,
  showDashboardCardActions,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("visualizations without click behavior", () => {
    it('does not allow to set click behavior for "text" virtual dashcard', () => {
      cy.createDashboard().then(({ body: dashboard }) => {
        const cards = [createTextCard({ text: "Hello world" })];
        updateDashboardCards({ dashboard_id: dashboard.id, cards });
        visitDashboard(dashboard.id);
        showDashboardCardActions();
        getDashboardCardMenu().should("not.exist");
      });
    });
  });
});
