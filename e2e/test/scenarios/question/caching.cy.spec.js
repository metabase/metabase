import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  questionInfoButton,
  restore,
  rightSidebar,
  setTokenFeatures,
  visitQuestion,
} from "e2e/support/helpers";

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
    cy.intercept("PUT", "/api/cache").as("putCacheConfig");
    visitQuestion(ORDERS_QUESTION_ID);

    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText(/Caching policy/).within(() => {
        cy.findByRole("button", { name: /Use default/ }).click();
      });
      cy.findByRole("heading", { name: /Caching settings/ }).click();
      cy.findByRole("radio", { name: /Duration/ }).click();
      cy.findByLabelText("Cache results for this many hours").type("48");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.findByText(/Caching policy/).within(() => {
        cy.log(
          "Check that the newly chosen cache invalidation policy - Duration - is now visible in the sidebar",
        );
        const durationButton = cy.findByRole("button", { name: /Duration/ });
        durationButton.should("be.visible");
        cy.log("Open the cache invalidation policy configuration form again");
        durationButton.click();
      });
      cy.findByRole("radio", { name: /Adaptive/ }).click();
      cy.findByLabelText(/Minimum query duration/).type("999");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.findByText(/Caching policy/).within(() => {
        cy.log(
          "Check that the newly chosen cache invalidation policy - Adaptive - is now visible in the sidebar",
        );
        const policyToken = cy.findByRole("button", { name: /Adaptive/ });
        policyToken.should("be.visible");
      });
    });
  });
});
