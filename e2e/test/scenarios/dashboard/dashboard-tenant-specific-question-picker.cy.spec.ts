const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";
import type { Collection, Dashboard, Tenant } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TENANT_USER = {
  first_name: "acme",
  last_name: "user",
  email: "acme.user@email.com",
  "@tenant": "acme",
};

const loginAsTenantUser = (returnTo: string) => {
  cy.task<string>("signJwt", {
    payload: TENANT_USER,
    secret: JWT_SHARED_SECRET,
  }).then((key) =>
    cy.visit(`/auth/sso?return_to=${encodeURIComponent(returnTo)}&jwt=${key}`),
  );
};

describe("scenarios > dashboard > tenant-specific question picker", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("use-tenants", true);

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
  });

  it("allows adding questions from the dashboard's tenant-specific collection (EMB-2312)", () => {
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
        .should("contain", "Acme")
        .and("not.contain", "Unknown");

      H.sidebar().findByText("Tenant questions").click();
      H.sidebar().findByText("Tenant orders").click();

      H.getDashboardCards()
        .should("have.length", 1)
        .and("contain", "Tenant orders");
    });
  });

  // Verify that Tenant collections and Our analytics are separate top-level entries.
  it("allows browsing into a tenant-specific collection from Our Analytics (EMB-2312)", () => {
    H.createDashboard({ name: "Our analytics dashboard" })
      .its("body")
      .as("dashboard");

    cy.get<Dashboard>("@dashboard").then(({ id }) => {
      H.visitDashboard(id);
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar()
        .findByTestId("breadcrumbs")
        .should("contain", "Collections")
        .and("contain", "Our analytics");

      H.sidebar().findByTestId("breadcrumbs").findByText("Collections").click();

      H.sidebar().findByText("Tenant collections").click();
      H.sidebar().findByText("Acme").click();
      H.sidebar().findByText("Tenant questions").click();
      H.sidebar().findByText("Tenant orders").click();

      H.getDashboardCards()
        .should("have.length", 1)
        .and("contain", "Tenant orders");
    });
  });
});

describe("scenarios > dashboard > tenant user question picker", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.request("PUT", "/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret": JWT_SHARED_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    cy.request("POST", "/api/ee/tenant", {
      name: "Acme",
      slug: "acme",
    })
      .its("body")
      .as("tenant");

    H.createSharedTenantCollection("Finance")
      .its("body")
      .as("financeCollection");
    H.createSharedTenantCollection("Marketing")
      .its("body")
      .as("marketingCollection");

    cy.get<Tenant>("@tenant")
      .then(({ tenant_collection_id }) =>
        H.createCollection({
          name: "Tenant questions",
          parent_id: tenant_collection_id,
        }),
      )
      .its("body")
      .as("tenantCollection");

    cy.get<Collection>("@tenantCollection")
      .then(({ id }) =>
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: id,
        }),
      )
      .its("body")
      .as("dashboard");
  });

  it("shows tenant collections without namespace grouping", () => {
    cy.get<Dashboard>("@dashboard").then(({ id }) => {
      loginAsTenantUser(`/dashboard/${id}`);
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar()
        .findByTestId("breadcrumbs")
        .should("contain", "Collections")
        .and("contain", "Our data");

      H.sidebar().findByTestId("breadcrumbs").findByText("Collections").click();

      H.sidebar().findByText("Our data").should("be.visible");
      H.sidebar().findByText("Finance").should("be.visible");
      H.sidebar().findByText("Marketing").should("be.visible");
      H.sidebar().findByText("Our analytics").should("not.exist");
      H.sidebar().findByText("Shared collections").should("not.exist");
      H.sidebar().findByText("Tenant collections").should("not.exist");
    });
  });
});
