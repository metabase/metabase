import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  restore,
  rightSidebar,
  setTokenFeatures,
  visitQuestion,
} from "e2e/support/helpers";

import { interceptRoutes as interceptPerformanceRoutes } from "../admin/performance/helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  durationRadioButton,
  openSidebarCacheStrategyForm,
} from "../admin/performance/helpers/e2e-strategy-form-helpers";

describeEE("scenarios > question > caching", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  /**
   * @note There is a similar test for the cache config form that appears in the dashboard sidebar.
   * It's in the Cypress describe block labeled "scenarios > dashboard > caching"
   */
  it("can configure cache for a question, on an enterprise instance", () => {
    interceptPerformanceRoutes();
    visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm();

    rightSidebar().within(() => {
      cy.findByRole("heading", { name: /Caching settings/ }).should(
        "be.visible",
      );
      durationRadioButton().click();
      cy.findByLabelText("Cache results for this many hours").type("48");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.log(
        "Check that the newly chosen cache invalidation policy - Duration - is now visible in the sidebar",
      );
      cy.findByLabelText(/Caching policy/).should("contain", "Duration");
      cy.findByLabelText(/Caching policy/).click();
      adaptiveRadioButton().click();
      cy.findByLabelText(/Minimum query duration/).type("999");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.log(
        "Check that the newly chosen cache invalidation policy - Adaptive - is now visible in the sidebar",
      );
      cy.findByLabelText(/Caching policy/).should("contain", "Adaptive");
    });
  });
});
