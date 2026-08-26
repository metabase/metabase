const { H } = cy;

import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";
import type { Collection, Dashboard, Tenant, User } from "metabase-types/api";

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

describe("scenarios > dashboard > tenant users using question picker", () => {
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
  });

  // Tenant users do not know what is a 'Tenant-specific collection' or 'Shared collection'.
  // Only show a flattened structure for them, with "Our data" being their tenant collection.
  it("shows flattened tenant collections without grouping by namespaces (EMB-2312)", () => {
    cy.get<Collection>("@tenantCollection")
      .then(({ id }) =>
        H.createDashboard({
          name: "Tenant dashboard",
          collection_id: id,
        }),
      )
      .its("body")
      .as("dashboard");

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

  // The API omits 'Our analytics' when tenant users cannot read it, but it still
  // returns their personal collection. Show that collection directly under the
  // synthetic collections level instead of adding another 'collections' folder.
  it("shows the personal collection under top-level collections (EMB-2312)", () => {
    loginAsTenantUser("/");

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

    cy.get<Dashboard>("@personalDashboard").then(({ id }) => {
      cy.intercept({
        method: "GET",
        pathname: "/api/collection/tree",
        query: {
          namespace: "shared-tenant-collection",
          "exclude-archived": "true",
        },
      }).as("sharedTenantCollections");

      H.visitDashboard(id);
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
});
