import { cancelConfirmationModal } from "e2e/test/scenarios/admin/performance/helpers/modals-helpers";

import { interceptPerformanceRoutes } from "../admin/performance/helpers/e2e-performance-helpers";
import {
  cacheStrategySidesheet,
  durationRadioButton,
  openSidebarCacheStrategyForm,
} from "../admin/performance/helpers/e2e-strategy-form-helpers";

const { H } = cy;

describe("scenarios > question > caching", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  /**
   * @note There is a similar test for closing the cache form when it's dirty
   * It's in the Cypress describe block labeled "scenarios > dashboard > caching"
   */
  it("should guard closing caching form if it's dirty on different actions", () => {
    interceptPerformanceRoutes();
    /**
     * we need to populate the history via react router by clicking route's links
     * in order to imitate a user who clicks "back" button
     */
    cy.visit("/");
    cy.findByTestId("main-navbar-root").findByText("Our analytics").click();
    cy.findByTestId("collection-table").findByText("Orders").click();

    openSidebarCacheStrategyForm("question");

    cacheStrategySidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      durationRadioButton().click();
    });
    // Action 1: clicking on cross button
    cacheStrategySidesheet().findByRole("button", { name: /Close/ }).click();
    cancelConfirmationModal();
    // Action 2: ESC button
    cy.get("body").type("{esc}");
    cancelConfirmationModal();
    // Action 3: click outside
    // When a user clicks somewhere outside he basically clicks on the top one
    cy.findAllByTestId("modal-overlay")
      .should("have.length.gte", 1)
      .last()
      .click();
    cancelConfirmationModal();
    // Action 4: browser's Back action
    cy.go("back");
    cancelConfirmationModal();
  });
});
