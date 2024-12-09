import { H } from "e2e/support";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { interceptPerformanceRoutes } from "../admin/performance/helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  durationRadioButton,
  openSidebarCacheStrategyForm,
} from "../admin/performance/helpers/e2e-strategy-form-helpers";

H.describeEE("scenarios > question > caching", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
  });

  /**
   * @note There is a similar test for the cache config form that appears in the dashboard sidebar.
   * It's in the Cypress describe block labeled "scenarios > dashboard > caching"
   */
  it("can configure cache for a question, on an enterprise instance", () => {
    interceptPerformanceRoutes();
    H.visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm("question");

    H.sidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      durationRadioButton().click();
      cy.findByLabelText("Cache results for this many hours").type("48");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.log(
        "Check that the newly chosen cache invalidation policy - Duration - is now visible in the sidebar",
      );
      cy.findByLabelText(/When to get new results/).should(
        "contain",
        "Duration",
      );
      cy.findByLabelText(/When to get new results/).click();
      adaptiveRadioButton().click();
      cy.findByLabelText(/Minimum query duration/).type("999");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.log(
        "Check that the newly chosen cache invalidation policy - Adaptive - is now visible in the sidebar",
      );
      cy.findByLabelText(/When to get new results/).should(
        "contain",
        "Adaptive",
      );
    });
  });

  it("can click 'Clear cache' for a question", () => {
    interceptPerformanceRoutes();
    H.visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm("question");

    H.sidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      cy.findByRole("button", {
        name: /Clear cache for this question/,
      }).click();
    });
    cy.findByTestId("confirm-modal").button("Clear cache").click();
    cy.wait("@invalidateCache");

    H.sidesheet().findByText("Cache cleared").should("be.visible");
  });
});
