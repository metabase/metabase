import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  restore,
  visitDashboard,
  setTokenFeatures,
} from "e2e/support/helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describeEE("issue 29076", () => {
  beforeEach(() => {
    restore();

    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as("cardQuery");

    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", PRODUCTS.ID, null]],
      },
    });
    cy.signInAsSandboxedUser();
  });

  it("should be able to drilldown to a saved question in a dashboard with sandboxing (metabase#29076)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.wait("@cardQuery");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    cy.wait("@cardQuery");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});
