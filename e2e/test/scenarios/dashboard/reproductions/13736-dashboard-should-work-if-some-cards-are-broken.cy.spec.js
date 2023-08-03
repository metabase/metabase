import {
  getDashboardCards,
  restore,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

describe("issue 13736", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should work even if some cards are broken (metabase#13736)", () => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/1/query", {
      statusCode: 500,
      body: {
        cause: "some error",
        data: {},
        message: "some error",
      },
    });

    cy.createDashboard({ name: "13736 Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        updateDashboardCards({
          dashboard_id: dashboardId,
          cards: [
            {
              card_id: 1,
            },
            {
              card_id: 2,
              col: 11,
            },
          ],
        });
        visitDashboard(dashboardId);
      },
    );

    getDashboardCards()
      .eq(0)
      .findByText("There was a problem displaying this chart.");

    getDashboardCards().eq(1).findByText("18,760").should("be.visible");
  });
});
