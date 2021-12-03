import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > visualizations > gauge chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept(`/api/dashboard/*/card/*/query`).as("cardQuery");
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
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              sizeX: 4,
              sizeY: 4,
              parameter_mappings: [],
            },
          ],
        });

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );

    cy.wait("@cardQuery");
    cy.findByTestId("gauge-arc-1").trigger("mousemove");
    cy.findByText("Something went wrong").should("not.exist");
  });
});
