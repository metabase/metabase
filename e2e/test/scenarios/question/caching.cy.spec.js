import { H } from "e2e/support";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { interceptRoutes as interceptPerformanceRoutes } from "../admin/performance/helpers/e2e-performance-helpers";
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

    openSidebarCacheStrategyForm();

    H.rightSidebar().within(() => {
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

  it("can click 'Clear cache' for a question", () => {
    interceptPerformanceRoutes();
    H.visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm();

    H.rightSidebar().within(() => {
      cy.findByRole("heading", { name: /Caching settings/ }).should(
        "be.visible",
      );
      cy.findByRole("button", {
        name: /Clear cache for this question/,
      }).click();
    });
    H.modal().within(() => {
      cy.findByRole("button", { name: /Clear cache/ }).click();
    });
    cy.wait("@invalidateCache");

    H.rightSidebar().within(() => {
      cy.findByText("Cache cleared").should("be.visible");
    });
  });
});
