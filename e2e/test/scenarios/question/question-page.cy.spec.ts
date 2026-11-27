const { H } = cy;

import {
  ORDERS_QUESTION_ENTITY_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > question > page", () => {
  describe("entity id support", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("/question/entity/${entity_id} and /question/entity/${entity_id}/notebook should redirect to /question/${id} and /question/${id}/notebook", () => {
      cy.visit(`/question/entity/${ORDERS_QUESTION_ENTITY_ID}`);
      cy.url().should("contain", `/question/${ORDERS_QUESTION_ID}`);

      // Making sure the question loads
      H.main()
        .findByTestId("saved-question-header-title")
        .should("have.text", "Orders");
      cy.title().should("eq", "Orders · Metabase");

      cy.visit(`/question/entity/${ORDERS_QUESTION_ENTITY_ID}/notebook`);
      cy.url().should("contain", `/question/${ORDERS_QUESTION_ID}/notebook`);

      H.queryBuilderHeader().should("contain", "Orders");
    });
  });

  describe("chart_generated snowplow event", () => {
    const generateNonTableVisualization = () => {
      cy.visit("/");
      H.openOrdersTable();
      H.summarize();

      // Change query to render a bar chart
      H.clickSummaryField("Quantity", { section: "Orders" });
      H.echartsContainer().findByText("Count").should("be.visible");
    };

    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should track first non-table visualization rendered", () => {
      generateNonTableVisualization();

      // Ensure chart_generated event is tracked
      H.expectUnstructuredSnowplowEvent({
        event: "chart_generated",
        event_detail: "bar",
      });

      // Reset and generate non-table visualization second time, after a reload
      // that reads back the setting the first chart saved
      H.resetSnowplow();
      generateNonTableVisualization();

      // Should not track chart_generated event again
      H.assertNoUnstructuredSnowplowEvent({ event: "chart_generated" });
    });
  });
});
