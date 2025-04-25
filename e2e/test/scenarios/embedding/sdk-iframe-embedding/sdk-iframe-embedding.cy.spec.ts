import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
  });

  it("displays a dashboard when given an api key", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        apiKey,
        dashboardId: ORDERS_DASHBOARD_ID,
      });

      cy.wait("@getDashCardQuery");

      frame.within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");
        cy.findByText("Orders").should("be.visible");
        H.assertTableRowsCount(2000);
      });
    });
  });

  it("displays a question when given an api key", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        apiKey,
        questionId: ORDERS_QUESTION_ID,
      });

      cy.wait("@getCardQuery");

      frame.within(() => {
        cy.findByText("Orders").should("be.visible");

        H.tableInteractive().within(() => {
          cy.findByText("Total").should("be.visible");
          cy.findByText("37.65").should("be.visible");
        });

        cy.findByTestId("chart-type-selector-button").click();

        cy.findByRole("menu").within(() => {
          cy.findByText("Trend").click();
        });

        cy.findByText("2000").should("be.visible");
      });
    });
  });
});
