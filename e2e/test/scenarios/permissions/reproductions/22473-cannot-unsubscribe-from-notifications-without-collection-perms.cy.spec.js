import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { restore, setupSMTP, sidebar } from "e2e/support/helpers";
import { modal } from "e2e/support/helpers/e2e-ui-elements-helpers";

const { nocollection } = USERS;

describe("issue 22473", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("nocollection user should be able to view and unsubscribe themselves from a subscription", () => {
    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.icon("subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${nocollection.first_name} ${nocollection.last_name}{enter}`)
      .blur();
    sidebar().within(() => {
      cy.button("Done").click();
    });

    cy.signIn("nocollection");
    cy.visit("/account/notifications");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard").should("exist");
    cy.findByTestId("notifications-list").within(() => {
      cy.findByLabelText("close icon").click();
    });
    modal().within(() => {
      cy.button("Unsubscribe").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard").should("not.exist");
  });
});
