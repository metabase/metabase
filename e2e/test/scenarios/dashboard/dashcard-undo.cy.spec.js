const { H } = cy;

describe("scenarios > dashboard cards > undo", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "when undoing a dashcard removal or dashcard tab movement, it should try to restore the position (best effort)",
    { scrollBehavior: false },
    () => {
      const checkOrder = () => {
        H.getDashboardCard(0).findByText("Text card 1");
        H.getDashboardCard(1).findByText("Text card 2");
        H.getDashboardCard(2).findByText("Text card 3");
        H.getDashboardCard(3).findByText("Text card 4");
      };

      const getPositions = ($grid) => {
        const gridRect = $grid[0].getBoundingClientRect();
        return $grid
          .find("[data-testid='dashcard-container']")
          .toArray()
          .map((dashcard) => {
            const rect = dashcard.getBoundingClientRect();
            return {
              left: Math.round(rect.left - gridRect.left),
              top: Math.round(rect.top - gridRect.top),
            };
          });
      };

      const checkPositions = () => {
        cy.get("@originalPositions").then((originalPositions) => {
          H.dashboardGrid().should(($grid) => {
            expect(getPositions($grid)).to.deep.equal(originalPositions);
          });
        });
      };

      const cards = [
        H.getTextCardDetails({
          text: "Text card 1",
          size_x: 4,
          size_y: 1,
          row: 0,
          col: 1,
        }),
        H.getTextCardDetails({
          text: "Text card 2",
          size_x: 4,
          size_y: 1,
          row: 1,
          col: 0,
        }),
        H.getTextCardDetails({
          text: "Text card 3",
          size_x: 4,
          size_y: 1,
          row: 2,
          col: 3,
        }),
        H.getTextCardDetails({
          text: "Text card 4",
          size_x: 4,
          size_y: 1,
          row: 3,
          col: 0,
        }),
      ];

      H.createDashboard().then(({ body: { id: dashboard_id } }) => {
        H.updateDashboardCards({ dashboard_id, cards });

        H.visitDashboard(dashboard_id);
      });

      checkOrder();

      H.editDashboard();
      H.dashboardGrid().then(getPositions).as("originalPositions");

      for (let i = 0; i < cards.length; i++) {
        H.removeDashboardCard(i);
        H.getDashboardCards().should("have.length", cards.length - 1);

        H.undo();
        H.getDashboardCards().should("have.length", cards.length);
        checkOrder();
        checkPositions();
        // Seems to be needed to allow the UI to catch up before hovering the next element.
        // TODO: improve this.
        cy.wait(200);
      }

      H.createNewTab();
      H.goToTab("Tab 1");

      for (let i = 0; i < cards.length; i++) {
        H.moveDashCardToTab({ dashcardIndex: i, tabName: "Tab 2" });
        H.getDashboardCards().should("have.length", cards.length - 1);

        H.undo();
        H.getDashboardCards().should("have.length", cards.length);
        checkOrder();
        checkPositions();
        cy.wait(200);
      }
    },
  );
});
