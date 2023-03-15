import { restore, setupSMTP, sidebar } from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";
const { nocollection } = USERS;
//const { ALL_USERS_GROUP, DATA_GROUP } = USER_GROUPS;

describe("issue 22473", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("nocollection user should be able to view and unsubscribe themselves from a subscription", () => {
    cy.visit(`/dashboard/1`);
    cy.icon("subscription").click();
    cy.findByText("Email it").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${nocollection.first_name} ${nocollection.last_name}{enter}`)
      .blur();
    sidebar().within(() => {
      cy.button("Done").click()
    });

    cy.signIn("nocollection");
    cy.visit("/account/notifications");

    cy.findByText("Orders in a dashboard").should("exist");

    cy.findByTestId("notifications-list").within(() => {
      cy.findByLabelText("close icon").click();
    });

  })
})
