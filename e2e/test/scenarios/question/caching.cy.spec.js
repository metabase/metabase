const { H } = cy;
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { interceptPerformanceRoutes } from "../admin/performance/helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  cacheStrategySidesheet,
  durationRadioButton,
  openSidebarCacheStrategyForm,
  questionSettingsSidesheet,
} from "../admin/performance/helpers/e2e-strategy-form-helpers";

describe("scenarios > question > caching", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  /**
   * @note There is a similar test for the cache config form that appears in the dashboard sidebar.
   * It's in the Cypress describe block labeled "scenarios > dashboard > caching"
   */
  it("can configure cache for a question, on an enterprise instance", () => {
    interceptPerformanceRoutes();
    H.visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm("question");

    cacheStrategySidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      durationRadioButton().click();
      cy.findByLabelText("Cache results for this many hours").type("48");
      cy.findByRole("button", { name: /Save/ }).click();
    });
    cy.wait("@putCacheConfig");

    questionSettingsSidesheet().within(() => {
      cy.log(
        "Check that the newly chosen cache invalidation policy - Duration - is now visible in the sidebar",
      );
      cy.findByLabelText(/When to get new results/).should(
        "contain",
        "Duration",
      );
      cy.findByLabelText(/When to get new results/).click();
    });

    cacheStrategySidesheet().within(() => {
      adaptiveRadioButton().click();
      cy.findByLabelText(/Minimum query duration/).type("999");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
    });

    questionSettingsSidesheet().within(() => {
      cy.log(
        "Check that the newly chosen cache invalidation policy - Adaptive - is now visible in the sidebar",
      );
      cy.findByLabelText(/When to get new results/).should(
        "contain",
        "Adaptive",
      );
    });
  });

  /**
   * @note There is a similar test for closing the cache form when it's dirty
   * It's in the Cypress describe block labeled "scenarios > dashboard > caching"
   */
  it("should guard closing caching form if it's dirty on different actions", () => {
    interceptPerformanceRoutes();
    H.visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm("question");

    cacheStrategySidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      durationRadioButton().click();
    });
    [
      // clicking on cross button
      () => cy.findByRole("button", { name: /Close/i }).click(),
      // ESC button
      () => cy.get("body").type("{esc}"),
      // click outside
      () => cy.findByTestId("modal-overlay").click({ force: true }),
      // clicking on title with back icon on it
      () => cy.findByRole("button", { name: /Caching settings/i }).click(),
      // browser's back button
      () => cy.go("back"),
      // browser's forward button
      () => cy.go("forward"),
    ].forEach((action) => {
      action();
      cy.findByTestId("confirm-modal").should("be.visible");
      cacheStrategySidesheet().should("be.visible");
    });
  });

  it("can click 'Clear cache' for a question", () => {
    interceptPerformanceRoutes();
    H.visitQuestion(ORDERS_QUESTION_ID);

    openSidebarCacheStrategyForm("question");

    cacheStrategySidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      cy.findByRole("button", {
        name: /Clear cache for this question/,
      }).click();
    });

    cy.findByTestId("confirm-modal").button("Clear cache").click();
    cy.wait("@invalidateCache");

    cacheStrategySidesheet().findByText("Cache cleared").should("be.visible");
  });
});
