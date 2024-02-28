import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  visitDashboard,
  restore,
  setupSMTP,
  dashboardHeader,
  sidebar,
} from "e2e/support/helpers";

describe("issue 30314", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("should clean the new subscription form on cancel (metabase#30314)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    dashboardHeader().findByLabelText("subscriptions").click();
    sidebar().within(() => {
      cy.findByText("Email it").click();

      cy.findByLabelText("Attach results").should("not.be.checked").click();
      cy.findByLabelText("Questions to attach")
        .should("not.be.checked")
        .click();

      cy.button("Cancel").click();
      cy.findByText("Email it").click();

      cy.findByLabelText("Attach results").should("not.be.checked");
      cy.findByText("Questions to attach").should("not.exist");
      cy.findByText(".xlsx").should("not.exist");
      cy.findByText(".csv").should("not.exist");
    });
  });
});
