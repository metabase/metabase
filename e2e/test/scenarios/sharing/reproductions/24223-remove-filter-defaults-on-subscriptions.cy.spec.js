import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  editDashboard,
  popover,
  restore,
  saveDashboard,
  sendEmailAndVisitIt,
  setTokenFeatures,
  setupSMTP,
} from "e2e/support/helpers";

const { admin } = USERS;

describeEE("issue 24223", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupSMTP();
  });

  it("should clear default filter", () => {
    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    addParametersToDashboard();
    cy.findByLabelText("subscriptions").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${admin.first_name} ${admin.last_name}{enter}`)
      .blur(); // blur is needed to close the popover

    cy.wait(500); // we need to wait here for some reason for CI to pass

    cy.findAllByText("Doohickey")
      .last()
      .closest("fieldset")
      .icon("close")
      .click();
    cy.button("Done").click();

    cy.get("[aria-label='Pulse Card']")
      .findByText("Text contains is Awesome")
      .click();

    sendEmailAndVisitIt();
    cy.get("table.header").within(() => {
      cy.findByText("Text").should("not.exist");
      cy.findByText("Awesome").parent().findByText("Text contains");
    });
  });
});

function addParametersToDashboard() {
  editDashboard();

  // add Category > Dropdown "Category" filter
  cy.icon("filter").click();
  cy.findByText("Text or Category").click();
  cy.findByText("Is").click();
  cy.findByText("Select…").click();
  popover().findByText("Category").click();
  cy.findByText("No default").click();
  popover().within(() => {
    cy.findByText("Doohickey").click();
    cy.button("Add filter").click();
  });

  cy.icon("filter").click();
  cy.findByText("Text or Category").click();
  cy.findByText("Contains").click();
  cy.findByText("Select…").click();
  popover().findByText("Title").click();
  cy.findByText("No default").click();
  popover().find("input").type("Awesome");
  popover().button("Add filter").click();

  saveDashboard();
}
