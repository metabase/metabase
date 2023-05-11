import {
  restore,
  editDashboard,
  saveDashboard,
  setupSMTP,
  visitDashboard,
  sendEmailAndAssert,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";

const {
  admin: { first_name, last_name },
} = USERS;

describe("issue 18344", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    // Rename the question
    visitDashboard(1);

    editDashboard();

    // Open visualization options
    cy.get(".Card").realHover();
    cy.icon("palette").click();

    cy.get(".Modal").within(() => {
      cy.findByDisplayValue("Orders").type("Foo");

      cy.button("Done").click();
    });

    saveDashboard();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("OrdersFoo");
  });

  it("subscription should not include original question name when it's been renamed in the dashboard (metabase#18344)", () => {
    // Send a test email subscription
    cy.icon("subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${first_name} ${last_name}`).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`To:`).click();

    sendEmailAndAssert(email => {
      expect(email.html).to.include("OrdersFoo");
    });
  });
});
