describe("scenarios > dashboard cards > undo", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it(
    "when undoing a dashcard removal or dashcard tab movement, it should try to restore the position (best effort)",
    { scrollBehavior: false },
    () => {
      const checkOrder = () => {
        cy.getDashboardCard(0).findByText("Text card 1");
        cy.getDashboardCard(1).findByText("Text card 2");
        cy.getDashboardCard(2).findByText("Text card 3");
        cy.getDashboardCard(3).findByText("Text card 4");
      };

      const cards = [
        cy.getTextCardDetails({
          text: "Text card 1",
          size_x: 4,
          size_y: 1,
          row: 0,
          col: 1,
        }),
        cy.getTextCardDetails({
          text: "Text card 2",
          size_x: 4,
          size_y: 1,
          row: 1,
          col: 0,
        }),
        cy.getTextCardDetails({
          text: "Text card 3",
          size_x: 4,
          size_y: 1,
          row: 2,
          col: 3,
        }),
        cy.getTextCardDetails({
          text: "Text card 4",
          size_x: 4,
          size_y: 1,
          row: 3,
          col: 0,
        }),
      ];

      cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
        cy.updateDashboardCards({ dashboard_id, cards });

        cy.visitDashboard(dashboard_id);
      });

      checkOrder();

      cy.editDashboard();

      for (let i = 0; i < cards.length; i++) {
        cy.removeDashboardCard(i);
        cy.getDashboardCards().should("have.length", cards.length - 1);

        cy.undo();
        cy.getDashboardCards().should("have.length", cards.length);
        checkOrder();
        // Seems to be needed to allow the UI to catch up before hovering the next element.
        // TODO: improve this.
        cy.wait(200);
      }

      cy.createNewTab();
      cy.goToTab("Tab 1");

      for (let i = 0; i < cards.length; i++) {
        cy.moveDashCardToTab({ dashcardIndex: i, tabName: "Tab 2" });
        cy.getDashboardCards().should("have.length", cards.length - 1);

        cy.undo();
        cy.getDashboardCards().should("have.length", cards.length);
        checkOrder();
        cy.wait(200);
      }
    },
  );
});
