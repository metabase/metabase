const { H } = cy;
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import {
  ALL_EXTERNAL_USERS_GROUP_ID,
  COLLECTION_GROUP_ID,
} from "e2e/support/cypress_sample_instance_data";

const { STATIC_ORDERS_ID, STATIC_PRODUCTS_ID } = SAMPLE_DB_TABLES;

const JWT_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

interface TenantAttributes {
  CAPS?: string;
  color?: string;
}

interface Tenant {
  name: string;
  slug: string;
  attributes?: TenantAttributes;
}

interface TenantUser {
  first_name: string;
  last_name: string;
  email: string;
  "@tenant": string;
}

const GIZMO_TENANT: Tenant = {
  name: "Gizmos",
  slug: "gizmo",
  attributes: {
    CAPS: "✨GIZMO✨",
    color: "cerulean",
  },
};

const DOOHICKEY_TENANT: Tenant = {
  name: "Doohickey",
  slug: "doohickey",
};

const GIZMO_USER: TenantUser = {
  first_name: "gizmo",
  last_name: "user",
  email: "gizmo.user@email.com",
  "@tenant": GIZMO_TENANT.slug,
};

const DOOHICKEY_USER: TenantUser = {
  first_name: "doohickey",
  last_name: "user",
  email: "doohickey.user@email.com",
  "@tenant": DOOHICKEY_TENANT.slug,
};

const SECOND_DOOHICKEY_USER: TenantUser = {
  first_name: "donthickey",
  last_name: "user",
  email: "donthickey.user@email.com",
  "@tenant": DOOHICKEY_TENANT.slug,
};

const TENANTS: Tenant[] = [GIZMO_TENANT, DOOHICKEY_TENANT];
const USERS: TenantUser[] = [GIZMO_USER, DOOHICKEY_USER, SECOND_DOOHICKEY_USER];

const GIZMO_FULL_NAME = H.getFullName(GIZMO_USER);

describe("Tenants - management", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/ee/tenant/*").as("getTenant");
    cy.intercept("GET", "/api/user/*").as("getUser");
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should allow users to enable multi tenancy, and create / manage tenants and tenant users", () => {
    // We expect this to redirect to /admin/people
    cy.visit("/admin/people/tenants");

    cy.location("pathname").should("eq", "/admin/people");
    cy.visit("/admin/people/tenants");

    cy.findByRole("navigation", { name: "people-nav" })
      .findByRole("link", { name: /Groups/ })
      .click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /All Users/ }).should("exist");
      cy.findByRole("link", { name: /Tenant users/ }).should("not.exist");
    });

    cy.findByRole("navigation", { name: "people-nav" })
      .findByRole("link", { name: /People/ })
      .click();

    cy.findByRole("link", { name: /Tenant users/ }).should("not.exist");
    cy.findByRole("link", { name: /Tenants/ }).should("not.exist");

    cy.findByRole("link", { name: /gear/ }).click();

    H.modal().within(() => {
      cy.findByRole("radio", { name: /Multi tenant/i }).click();
      cy.button("Apply").click();
    });

    cy.findByRole("link", { name: /Tenant users/ }).should("exist");
    cy.findByRole("link", { name: /Tenants/ }).should("exist");

    cy.findByTestId("admin-layout-content").within(() => {
      cy.log("after enabling multi-tenancy, it takes you to the tenants page");
      cy.findByText("Tenants", { timeout: 10_000 }).should("be.visible");

      cy.findByText(/Create your first tenant to start adding/).should(
        "be.visible",
      );
    });

    // Onboarding: create the first tenant
    cy.findByRole("button", { name: "Create your first tenant" })
      .should("be.visible")
      .click();

    H.modal().within(() => {
      cy.findByText("Set up your first tenant").should("be.visible");

      cy.findByRole("textbox", { name: "Give this tenant a name" }).type(
        "Parrot",
      );

      cy.log("slug should be pre-filled");
      cy.findByRole("textbox", { name: "Slug for this tenant" }).should(
        "have.value",
        "parrot",
      );

      cy.button("Create tenant").click();
    });

    H.undoToastList()
      .contains("Tenant creation successful")
      .should("be.visible");

    cy.findByRole("button", { name: "New tenant" }).click();

    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Give this tenant a name" }).type(
        "Eagle",
      );

      cy.button("Create tenant").click();
    });

    H.undoToastList()
      .contains("Tenant creation successful")
      .should("be.visible");

    cy.findByRole("button", { name: "New tenant" }).click();

    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Give this tenant a name" }).type(
        "Turkey",
      );
      cy.button("Create tenant").click();
    });

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
      cy.findByRole("link", { name: /Turkey/ }).should("exist");

      // Edit a tenant
      cy.findAllByRole("button", { name: /ellipsis/ })
        .eq(2)
        .click();
    });

    H.popover().findByText("Edit tenant").click();

    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Give this tenant a name" })
        .should("have.value", "Turkey")
        .clear()
        .type("Chicken");

      cy.findByRole("textbox", { name: "Slug for this tenant" })
        .should("have.value", "turkey")
        .should("be.disabled");

      cy.button("Update").click();
    });

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
      cy.findByRole("link", { name: /Chicken/ }).should("exist");

      // Edit a tenant
      cy.findAllByRole("button", { name: /ellipsis/ })
        .eq(1)
        .click();
    });

    // Deactivate a tenant
    H.popover().findByText("Deactivate tenant").click();
    H.modal().button("Deactivate").click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Chicken/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("not.exist");
    });

    cy.findByRole("tab", { name: "Deactivated" }).click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("not.exist");
      cy.findByRole("link", { name: /Chicken/ }).should("not.exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
    });

    // Create an external user
    cy.findByRole("link", { name: /Tenant users/ }).click();
    cy.button("Create tenant user").click();

    H.modal().within(() => {
      cy.findByRole("textbox", { name: "First name" }).type("Test");
      cy.findByRole("textbox", { name: "Last name" }).type("User");
      cy.findByRole("textbox", { name: "Email" }).type("test.user@email.com");
      cy.findByRole("generic", { name: "Groups" }).should("not.exist");
      cy.findByRole("textbox", { name: "Tenant" }).click();
    });

    H.popover().within(() => {
      cy.findByText("Eagle").should("not.exist");
      cy.findByText("Parrot").click();
    });

    H.modal().within(() => {
      cy.findByText("Attributes").click();
      cy.findByTestId("mapping-editor").within(() => {
        cy.findByText("@tenant.slug").should("exist");
        cy.findByDisplayValue("parrot").should("exist");

        cy.findByRole("button", { name: /Add an attribute/i }).click();
        cy.findByPlaceholderText("Key").type("my-special-attr");

        cy.findAllByPlaceholderText("Value")
          .should("have.length", 2)
          .last()
          .type("Snowflake");
      });

      cy.button("Create").click();
    });

    cy.button("Done").click();
    cy.findByTestId("admin-people-list-table").should("contain.text", "Parrot");

    // Reactivate tenant
    cy.findByRole("link", { name: /Tenants/ }).click();
    cy.findByTestId("admin-content-table").should("contain.text", "1");

    cy.findByRole("tab", { name: "Deactivated" }).click();
    cy.findByTestId("admin-content-table")
      .findByRole("button", { name: /ellipsis/ })
      .click();
    H.popover().findByText("Reactivate tenant").click();
    H.modal().button("Reactivate").click();

    cy.log(
      "after reactivating the last deactivated tenant, tabs should disappear and show all active tenants",
    );
    cy.findByRole("tab", { name: "Deactivated" }).should("not.exist");
    cy.findByRole("tab", { name: /Active/ }).should("not.exist");

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
    });

    cy.findByRole("navigation", { name: "people-nav" })
      .findByRole("link", { name: /Internal groups/ })
      .click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /All internal users/ }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: /All tenant users/ }).should("not.exist");
    });

    cy.findByRole("navigation", { name: "people-nav" })
      .findAllByRole("link", { name: /Tenant groups/ })
      .click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /All internal users/ }).should("not.exist");
      cy.findByRole("row", {
        name: `group-${ALL_EXTERNAL_USERS_GROUP_ID}-row`,
      }).within(() => {
        cy.findByRole("cell", { name: "member-count" }).should(
          "contain.text",
          "1",
        );
        cy.findByRole("button", {
          name: "group-action-button",
        }).should("not.exist");
        cy.findByRole("link", { name: /All tenant users/ }).click();
      });
    });

    cy.findByTestId("admin-panel")
      .findByText(/All tenant users group and can't be removed from it/)
      .should("exist");
  });

  it("should build the tenant collections permission table from the real collection graph", () => {
    cy.request("PUT", "/api/setting", { "use-tenants": true });

    cy.visit("/admin/permissions/tenant-collections/root");

    cy.findByTestId("permission-table").within(() => {
      cy.findByText("All internal users").should("be.visible");
      cy.findByText("All tenant users").should("be.visible");
    });
  });

  it("should show tenant attributes in user attribute lists when multi tenancy is enabled", () => {
    H.restore("postgres-writable");
    H.activateToken("pro-self-hosted"); // needed because of the restore on the line above

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);

    cy.findByRole("switch", { name: /data actions/i }).click({ force: true });
    cy.findByRole("switch", { name: /database routing/i }).click({
      force: true,
    });

    cy.findByPlaceholderText("Choose an attribute").click();

    H.popover().findByText("@tenant.slug").should("not.exist");
    cy.visit(
      `/admin/permissions/data/database/${WRITABLE_DB_ID}/impersonated/group/${COLLECTION_GROUP_ID}`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();

    H.popover().findByText("@tenant.slug").should("not.exist");
    cy.visit(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );

    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover().findByText("@tenant.slug").should("not.exist");

    cy.request("PUT", "/api/setting/use-tenants", { value: true });

    createTenants();
    createUsers();

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.findByRole("switch", { name: /database routing/i }).click({
      force: true,
    });

    cy.findByPlaceholderText("Choose an attribute").click();
    H.popover()
      .findByRole("option", { name: /@tenant.slug/ })
      .findByTestId("system-defined-tooltip-icon")
      .realHover();
    // The select input also has a tooltip on hover, so we need to findAll
    cy.findAllByRole("tooltip").should(
      "contain.text",
      "This attribute is system defined",
    );

    cy.visit(
      `/admin/permissions/data/database/${WRITABLE_DB_ID}/impersonated/group/${COLLECTION_GROUP_ID}`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover()
      .findByRole("option", { name: /@tenant.slug/ })
      .findByTestId("system-defined-tooltip-icon");

    cy.visit(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover()
      .findByRole("option", { name: /@tenant.slug/ })
      .findByTestId("system-defined-tooltip-icon");

    cy.log("check that tenant attributes propagate to users");

    cy.visit("/admin/people/tenants/people");
    cy.findByTestId("nav-item-external-users").findByText("Tenant users", 1000);
    cy.findByTestId("admin-people-list-table").within(() => {
      cy.findByText(`${GIZMO_USER.first_name} ${GIZMO_USER.last_name}`).should(
        "exist",
      );
    });

    cy.findAllByRole("button", { name: /ellipsis/ })
      .should("have.length", 3)
      .last()
      .click();
    H.popover().findByText("Edit user").click();

    cy.wait(["@getUser", "@getTenant"]);

    H.modal().within(() => {
      cy.findByText("Attributes").click();
      Object.entries(GIZMO_TENANT.attributes!).forEach(([key, value]) => {
        cy.findByText(key).should("be.visible");
        cy.findByDisplayValue(value).should("be.visible");
      });
    });
  });
});

describe("tenant users", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/ee/tenant/*").as("getTenant");
    cy.intercept("GET", "/api/user/*").as("getUser");

    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.request("PUT", "/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": "localhost:4000",
      "jwt-shared-secret": JWT_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    createTenants();
    USERS.forEach((user) =>
      cy
        .task<string>("signJwt", {
          payload: user,
          secret: JWT_SECRET,
        })
        .then((key) =>
          cy.request(
            "GET",
            `/auth/sso?return_to=/question/notebook&jwt=${key}`,
          ),
        ),
    );

    //Need to sign in as admin again because of the JWT logins
    cy.signInAsAdmin();

    const TTAG_NAME = "tenant.name";

    H.createNativeQuestion({
      name: "sql param in a dashboard",
      native: {
        query: `select * from products where lower(Category) = {{${TTAG_NAME}}}`,
        "template-tags": {
          [TTAG_NAME]: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
            name: TTAG_NAME,
            "display-name": "tenant name",
            type: "text",
          },
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.sandboxTable({
        table_id: STATIC_PRODUCTS_ID,
        card_id: QUESTION_ID,
        group_id: ALL_EXTERNAL_USERS_GROUP_ID,
        attribute_remappings: {
          "@tenant.slug": ["variable", ["template-tag", TTAG_NAME]],
        },
      });
    });
  });

  it("should disable users on a tenant when disabling the tenant", () => {
    cy.visit("/admin/people/tenants/people");

    cy.findAllByRole("row")
      .contains("tr", "donthickey user")
      .findByRole("button", { name: /ellipsis/ })
      .click();

    H.popover().findByText("Deactivate user").click();
    H.modal().button("Deactivate").click();

    cy.findByRole("link", { name: /tenants/i }).click();

    cy.findAllByRole("row")
      .contains("tr", "doohickey")
      .findByRole("button", { name: /ellipsis/ })
      .click();

    H.popover().findByText("Deactivate tenant").click();
    H.modal().button("Deactivate").click();

    cy.findByRole("link", { name: /tenant users/i }).click();

    // assert that only gizmo users are still active
    cy.findByTestId("admin-layout-content").findByText("1 person found");

    cy.findAllByRole("row")
      .contains("tr", GIZMO_FULL_NAME)
      .findByRole("button", { name: /ellipsis/ })
      .click();

    H.popover().findByText("Deactivate user").click();
    H.modal().button("Deactivate").click();

    cy.findByRole("tab", { name: "Deactivated" }).click({ force: true });

    cy.findByTestId("admin-layout-content").findByText("3 people found");

    // Disabled users should still show their tenant names
    cy.findAllByRole("row")
      .contains("tr", "donthickey user")
      .findByRole("cell", { name: "Doohickey" })
      .should("exist");

    cy.findAllByRole("row")
      .contains("tr", "donthickey user")
      .findByRole("link", { name: /refresh/ })
      .realHover();

    H.tooltip().should(
      "contain.text",
      "Cannot reactivate users on a disabled tenant",
    );

    cy.findAllByRole("row")
      .contains("tr", GIZMO_FULL_NAME)
      .findByRole("link", { name: /refresh/ })
      .realHover();

    H.tooltip().should("contain.text", "Reactivate this account");

    cy.findByRole("link", { name: /tenants/i }).click();
    cy.findByRole("tab", { name: "Deactivated" }).click();

    cy.findAllByRole("row")
      .contains("tr", "doohickey")
      .findByRole("button", { name: /ellipsis/ })
      .click();

    H.popover().findByText("Reactivate tenant").click();
    H.modal().button("Reactivate").click();

    cy.findByRole("link", { name: /tenant users/i }).click();

    // Only 1 Doohickey user should have been re-activated
    cy.findByTestId("admin-layout-content").findByText("1 person found");

    cy.findAllByRole("row").contains("tr", "doohickey").should("exist");
  });

  it("should accept a tenant when provisioning a user via JWT", () => {
    cy.task<string>("signJwt", {
      payload: GIZMO_USER,
      secret: JWT_SECRET,
    }).then((key) =>
      cy.visit(`/auth/sso?return_to=/question/notebook&jwt=${key}`),
    );

    H.popover().findByText("Products").click();
    cy.button("Visualize").click();

    cy.get("[data-column-id=CATEGORY]")
      .should("not.contain.text", "Doohickey")
      .should("not.contain.text", "Gadget")
      .should("not.contain.text", "Widget")
      .should("contain.text", "Gizmo");

    cy.task<string>("signJwt", {
      payload: DOOHICKEY_USER,
      secret: JWT_SECRET,
    }).then((key) =>
      cy.visit(`/auth/sso?return_to=/question/notebook&jwt=${key}`),
    );

    H.popover().findByText("Products").click();
    cy.button("Visualize").click();

    cy.get("[data-column-id=CATEGORY]")
      .should("not.contain.text", "Gizmo")
      .should("not.contain.text", "Gadget")
      .should("not.contain.text", "Widget")
      .should("contain.text", "Doohickey");

    H.openNavigationSidebar();

    H.navigationSidebar()
      .findByTestId("navbar-new-collection-button")
      .should("not.exist");
  });
});

const createUsers = () => {
  cy.request("GET", "/api/ee/tenant").then(({ body }) => {
    USERS.forEach((user) => {
      const tenantId = body.data.find(
        (tenant: Tenant) => tenant.slug === user["@tenant"],
      ).id;

      cy.request("POST", "/api/user", { ...user, tenant_id: tenantId });
    });
  });
};

const createTenants = () => {
  TENANTS.forEach((tenant) => cy.request("POST", "/api/ee/tenant", tenant));
};
