const { H } = cy;

import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

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

      cy.wait("@getDashboard");
      cy.findByText("Loading...").should("not.exist");

      frame.contains("Orders in a dashboard").should("be.visible");
    });
  });

  it("displays a question when given an api key", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        apiKey,
        questionId: ORDERS_QUESTION_ID,
      });

      frame.contains("Orders").should("be.visible");
    });
  });
});
