import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  setupSMTP,
  visitDashboard,
  sendEmailAndAssert,
  sidebar,
} from "e2e/support/helpers";

describe("issue 18009", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    cy.signIn("nodata");
  });

  it("nodata user should be able to create and receive an email subscription without errors (metabase#18009)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByLabelText("subscriptions").click();

    sidebar()
      .findByPlaceholderText("Enter user names or email addresses")
      .click();
    popover()
      .contains(/^No Data/)
      .click();

    // Click anywhere to close the popover that covers the "Send email now" button
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("To:").click();

    sendEmailAndAssert(email => {
      expect(email.html).not.to.include(
        "An error occurred while displaying this card.",
      );

      expect(email.html).to.include("37.65");
    });
  });
});
