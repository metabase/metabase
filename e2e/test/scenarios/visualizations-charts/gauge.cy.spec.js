import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visitDashboard } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > gauge chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not rerender on gauge arc hover (metabase#15980)", () => {
    const questionDetails = {
      name: "15980",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "gauge",
    };

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

    cy.findByTestId("gauge-arc-1").trigger("mousemove");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Something went wrong").should("not.exist");
  });
});
