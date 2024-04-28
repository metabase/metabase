import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  dashboardCards,
  queryBuilderMain,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > progress chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render progress bar in query builder and dashboard (metabase#40658, metabase#41243)", () => {
    const QUESTION_NAME = "40658";
    const questionDetails = {
      name: QUESTION_NAME,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "progress",
    };

    // check dashboard chart render
    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Make dashboard card really small (necessary for this repro as it doesn't show any labels)
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 5,
              size_y: 4,
              parameter_mappings: [],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );

    dashboardCards()
      .first()
      .within(() => {
        cy.findByText("18,760").should("be.visible");
        cy.findByText("Goal 0").should("be.visible");
        cy.findByText("Goal exceeded").should("be.visible");
      });

    // check query builder chart render
    dashboardCards().first().findByText(QUESTION_NAME).click();
    queryBuilderMain().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText("Goal 0").should("be.visible");
      cy.findByText("Goal exceeded").should("be.visible");
    });
  });
});
