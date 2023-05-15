import { describeEE, restore, visitDashboard } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describeEE("issue 29076", () => {
  beforeEach(() => {
    restore();

    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as("cardQuery");

    cy.signInAsAdmin();
    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", PRODUCTS.ID, null]],
      },
    });
    cy.signInAsSandboxedUser();
  });

  it("should be able to drilldown to a saved question in a dashboard with sandboxing (metabase#29076)", () => {
    visitDashboard(1);
    cy.wait("@cardQuery");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    cy.wait("@cardQuery");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});
