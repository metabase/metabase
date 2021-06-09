import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > visualizations > gauge chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should not rerender on gauge arc hover (metabase#15980)", () => {
    cy.createQuestion({
      name: "15980",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      display: "gauge",
    }).then(({ body: { id: questionId } }) => {
      cy.createDashboard("15980D").then(({ body: { id: dashboardId } }) => {
        // Add previously created question to the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: questionId,
        }).then(({ body: { id: dashCardId } }) => {
          // Make dashboard card really small (necessary for this repro as it doesn't show any labels)
          cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
            cards: [
              {
                id: dashCardId,
                card_id: questionId,
                row: 0,
                col: 0,
                sizeX: 4,
                sizeY: 4,
                parameter_mappings: [],
              },
            ],
          });
        });
        cy.intercept(`/api/card/${questionId}/query`).as("cardQuery");

        cy.visit(`/dashboard/${dashboardId}`);
        cy.wait("@cardQuery");
        cy.findByTestId("gauge-arc-1").trigger("mousemove");
        cy.findByText("Something went wrong").should("not.exist");
      });
    });
  });
});
