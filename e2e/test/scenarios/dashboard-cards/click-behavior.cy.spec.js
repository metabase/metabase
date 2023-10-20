import {
  createHeadingCard,
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
    it("does not allow to set click behavior for virtual dashcards", () => {
      cy.createDashboard().then(({ body: dashboard }) => {
        const cardSize = { size_x: 4, size_y: 1 };
        const textCard = createTextCard({
          text: "Hello world",
          row: 0,
          ...cardSize,
        });
        const headingCard = createHeadingCard({
          text: "Hello world",
          row: 1,
          ...cardSize,
        });
        const cards = [textCard, headingCard];
        updateDashboardCards({ dashboard_id: dashboard.id, cards });
        visitDashboard(dashboard.id);
        cards.forEach((card, index) => {
          const display = card.visualization_settings.virtual_card.display;
          cy.log(`does not allow to set click behavior for "${display}" card`);
          showDashboardCardActions(index);
          getDashboardCardMenu(index).should("not.exist");
        });
      });
    });
  });
});
