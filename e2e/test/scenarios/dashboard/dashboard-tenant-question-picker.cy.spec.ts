const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";
import type { Collection, Dashboard, Tenant, User } from "metabase-types/api";

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

describe("scenarios > dashboard > tenant question picker", () => {
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

    H.createSharedTenantCollection("Finance");
    H.createSharedTenantCollection("Marketing");

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

  it("lets admins add questions from tenant-specific collections (EMB-2312)", () => {
    cy.get<Tenant>("@tenant")
      .then(({ tenant_collection_id }) =>
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: tenant_collection_id,
        }),
      )
      .its("body")
      .as("tenantDashboard");

    H.createDashboard({ name: "Our analytics dashboard" })
      .its("body")
      .as("rootDashboard");

    cy.log("from the dashboard's tenant-specific collection");
    cy.get<Dashboard>("@tenantDashboard").then(({ id }) => {
      H.visitDashboard(id);
    });
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
    H.saveDashboard();

    // Tenant collections and Our analytics are separate top-level entries
    cy.log("by browsing from Our analytics");
    cy.get<Dashboard>("@rootDashboard").then(({ id }) => {
      H.visitDashboard(id);
    });
    H.editDashboard();
    H.openQuestionsSidebar();

    H.sidebar()
      .findByTestId("breadcrumbs")
      .should("contain", "Collections")
      .and("contain", "Our analytics");

    H.sidebar().findByTestId("breadcrumbs").findByText("Collections").click();

    H.sidebar().findByText("Our analytics").should("be.visible");
    H.sidebar().findByText("Shared collections").should("be.visible");
    H.sidebar().findByText("Tenant collections").click();
    H.sidebar().findByText("Acme").click();
    H.sidebar().findByText("Tenant questions").click();
    H.sidebar().findByText("Tenant orders").click();

    H.getDashboardCards()
      .should("have.length", 1)
      .and("contain", "Tenant orders");
  });

  it("shows tenant users a flattened collection tree (EMB-2312)", () => {
    cy.get<Collection>("@tenantCollection")
      .then(({ id }) =>
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: id,
        }),
      )
      .its("body")
      .as("tenantDashboard");

    // Tenant users do not know what is a 'Tenant-specific collection' or 'Shared collection'.
    // Only show a flattened structure for them, with "Our data" being their tenant collection.
    cy.log("from a dashboard in the tenant collection");
    cy.get<Dashboard>("@tenantDashboard").then(({ id }) => {
      loginAsTenantUser(`/dashboard/${id}`);
    });
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

    // The API omits 'Our analytics' when tenant users cannot read it, but it still
    // returns their personal collection. Show that collection directly under the
    // synthetic collections level instead of adding another 'collections' folder.
    cy.log("from a dashboard in the personal collection");
    cy.request<User>("GET", "/api/user/current").its("body").as("tenantUser");

    cy.get<User>("@tenantUser")
      .then(({ personal_collection_id }) => {
        if (personal_collection_id == null) {
          throw new Error("Tenant user has no personal collection");
        }

        return H.createDashboard({
          name: "Personal dashboard",
          collection_id: personal_collection_id,
        });
      })
      .its("body")
      .as("personalDashboard");

    cy.intercept({
      method: "GET",
      pathname: "/api/collection/tree",
      query: {
        namespace: "shared-tenant-collection",
        "exclude-archived": "true",
      },
    }).as("sharedTenantCollections");

    cy.get<Dashboard>("@personalDashboard").then(({ id }) => {
      H.visitDashboard(id);
    });
    H.editDashboard();
    H.openQuestionsSidebar();

    cy.wait("@sharedTenantCollections");

    H.sidebar()
      .findByTestId("breadcrumbs")
      .should("contain", "Collections")
      .and("contain", "My personal collection");

    H.sidebar().findByTestId("breadcrumbs").findByText("Collections").click();

    H.sidebar()
      .findByRole("menuitem", { name: "My personal collection" })
      .should("be.visible");

    // There should not be a second nested "Collections" folder.
    H.sidebar()
      .findByTestId("breadcrumbs")
      .findAllByText("Collections")
      .should("have.length", 1);

    H.sidebar()
      .findByRole("menuitem", { name: "Collections" })
      .should("not.exist");
  });
});
