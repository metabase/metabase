import {
  createNewTab,
  editDashboard,
  getDashboardCard,
  getDashboardCards,
  getTextCardDetails,
  goToTab,
  moveDashCardToTab,
  removeDashboardCard,
  restore,
  undo,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

describe("scenarios > dashboard cards > undo", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it(
    "when undoing a dashcard removal or dashcard tab movement, it should try to restore the position (best effort)",
    { scrollBehavior: false },
    () => {
      const checkOrder = () => {
        getDashboardCard(0).findByText("Text card 1");
        getDashboardCard(1).findByText("Text card 2");
        getDashboardCard(2).findByText("Text card 3");
        getDashboardCard(3).findByText("Text card 4");
      };

      const cards = [
        getTextCardDetails({
          text: "Text card 1",
          size_x: 4,
          size_y: 1,
          row: 0,
          col: 1,
        }),
        getTextCardDetails({
          text: "Text card 2",
          size_x: 4,
          size_y: 1,
          row: 1,
          col: 0,
        }),
        getTextCardDetails({
          text: "Text card 3",
          size_x: 4,
          size_y: 1,
          row: 2,
          col: 3,
        }),
        getTextCardDetails({
          text: "Text card 4",
          size_x: 4,
          size_y: 1,
          row: 3,
          col: 0,
        }),
      ];

      cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
        updateDashboardCards({ dashboard_id, cards });

        visitDashboard(dashboard_id);
      });

      checkOrder();

      editDashboard();

      for (let i = 0; i < cards.length; i++) {
        removeDashboardCard(i);
        getDashboardCards().should("have.length", cards.length - 1);

        undo();
        getDashboardCards().should("have.length", cards.length);
        checkOrder();
      }

      createNewTab();
      goToTab("Tab 1");

      for (let i = 0; i < cards.length; i++) {
        moveDashCardToTab({ dashcardIndex: i, tabName: "Tab 2" });
        getDashboardCards().should("have.length", cards.length - 1);

        undo();
        getDashboardCards().should("have.length", cards.length);
        checkOrder();
      }
    },
  );
});
