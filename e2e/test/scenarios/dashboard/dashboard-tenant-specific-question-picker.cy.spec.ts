const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Collection, Dashboard, Tenant } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > tenant-specific question picker (EMB-2312)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("use-tenants", true);
  });

  it("allows adding questions from the dashboard's tenant-specific collection", () => {
    cy.request("POST", "/api/ee/tenant", {
      name: "Acme",
      slug: "acme",
    })
      .its("body")
      .as("tenant");

    cy.get<Tenant>("@tenant")
      .then(({ tenant_collection_id }) =>
        H.createCollection({
          name: "Tenant questions",
          parent_id: tenant_collection_id,
        }),
      )
      .its("body")
      .as("tenantCollection");

    cy.get<Collection>("@tenantCollection").then((tenantCollection) =>
      H.createQuestion({
        name: "Tenant orders",
        collection_id: tenantCollection.id,
        query: { "source-table": ORDERS_ID },
      }),
    );

    cy.get<Tenant>("@tenant")
      .then(({ tenant_collection_id }) =>
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: tenant_collection_id,
        }),
      )
      .its("body")
      .as("dashboard");

    cy.get<Dashboard>("@dashboard").then(({ id }) => {
      H.visitDashboard(id);
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar()
        .findByTestId("breadcrumbs")
        .should("contain", "Tenant collection: Acme")
        .and("not.contain", "Unknown");

      H.sidebar().findByText("Tenant questions").click();
      H.sidebar().findByText("Tenant orders").click();

      H.getDashboardCards().should("have.length", 1);
    });
  });
});
