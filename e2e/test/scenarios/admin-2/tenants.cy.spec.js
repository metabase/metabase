const {
  WRITABLE_DB_ID,
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
} = require("e2e/support/cypress_data");
const {
  COLLECTION_GROUP_ID,
  ALL_EXTERNAL_USERS_GROUP_ID,
} = require("e2e/support/cypress_sample_instance_data");
const { getPermissionRowPermissions } = require("e2e/support/helpers");

const { STATIC_ORDERS_ID, STATIC_PRODUCTS_ID } = SAMPLE_DB_TABLES;

const { H } = cy;

const JWT_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

const GIZMO_TENANT = {
  name: "Gizmos",
  slug: "gizmo",
  attributes: {
    CAPS: "✨GIZMO✨",
    color: "cerulean",
  },
};

const DOOHICKEY_TENANT = {
  name: "Doohickey",
  slug: "doohickey",
};

const GIZMO_USER = {
  first_name: "gizmo",
  last_name: "user",
  email: "gizmo.user@email.com",
  tenant: GIZMO_TENANT.slug,
};

const DOOHICKEY_USER = {
  first_name: "doohickey",
  last_name: "user",
  email: "doohickey.user@email.com",
  tenant: DOOHICKEY_TENANT.slug,
};

const SECOND_DOOHICKEY_USER = {
  first_name: "donthickey",
  last_name: "user",
  email: "donthickey.user@email.com",
  tenant: DOOHICKEY_TENANT.slug,
};

const TENANTS = [GIZMO_TENANT, DOOHICKEY_TENANT];
const USERS = [GIZMO_USER, DOOHICKEY_USER, SECOND_DOOHICKEY_USER];

describe("Tenants - management OSS", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show the popup to enable multi tenancy", () => {
    cy.visit("/admin/tenants");
    cy.location("pathname").should("eq", "/admin/people");

    cy.findByRole("link", { name: /gear/ }).should("not.exist");
  });
});

describe("Tenants - management", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/ee/tenant/*").as("getTenant");
    cy.intercept("GET", "/api/user/*").as("getUser");
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should disable the feature if the token feature is not enabled", () => {
    H.deleteToken();

    cy.visit("/admin/tenants");
    cy.location("pathname").should("eq", "/admin/people");

    cy.findByRole("link", { name: /gear/ }).should("not.exist");
  });

  it("should allow users to enable multi tenancy, and create / manage tenants and external users", () => {
    // We expect this to redirect to /admin/people
    cy.visit("/admin/tenants");

    cy.location("pathname").should("eq", "/admin/people");
    cy.visit("/admin/tenants");

    cy.findByRole("navigation", { name: "people-nav" })
      .findByRole("link", { name: /Groups/ })
      .click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /All Users/ }).should("exist");
      cy.findByRole("link", { name: /External Users/ }).should("not.exist");
    });

    cy.findByRole("navigation", { name: "people-nav" })
      .findByRole("link", { name: /People/ })
      .click();

    cy.findByRole("link", { name: /External Users/ }).should("not.exist");
    cy.findByRole("link", { name: /Tenants/ }).should("not.exist");

    cy.findByRole("link", { name: /gear/ }).click();

    H.modal().findByRole("textbox", { name: "User strategy" }).click();
    H.popover().findByText("Multi tenant").click();
    H.modal().button("Close").click();

    cy.findByRole("link", { name: /External Users/ }).should("exist");
    cy.findByRole("link", { name: /Tenants/ }).click();

    // Create some tenants
    cy.findByRole("button", { name: "New tenant" }).click();
    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Display name" }).type("Parrot");
      cy.findByRole("textbox", { name: "Slug" }).should("have.value", "parrot");
      cy.button("Create").click();
    });

    cy.findByRole("button", { name: "New tenant" }).click();
    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Display name" }).type("Eagle");
      cy.button("Create").click();
    });

    cy.findByRole("button", { name: "New tenant" }).click();
    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Display name" }).type("Turkey");
      cy.button("Create").click();
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
      cy.findByRole("textbox", { name: "Display name" })
        .should("have.value", "Turkey")
        .clear()
        .type("Chicken");
      cy.findByRole("textbox", { name: "Slug" })
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

    cy.findByLabelText("Deactivated").click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("not.exist");
      cy.findByRole("link", { name: /Chicken/ }).should("not.exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
    });

    // Create an external user
    cy.findByRole("link", { name: /External Users/ }).click();
    cy.button("Invite someone").click();

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
        cy.findByPlaceholderText("Key").type("@tenant.name", {
          parseSpecialCharSequences: false,
        });

        cy.findByText(
          'Keys starting with "@" are reserved for system use',
        ).should("exist");
        cy.findByPlaceholderText("Key").clear().type("my-special-attr");

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

    cy.findByLabelText("Deactivated").click();
    cy.findByTestId("admin-content-table")
      .findByRole("button", { name: /ellipsis/ })
      .click();
    H.popover().findByText("Reactivate tenant").click();
    H.modal().button("Reactivate").click();
    cy.findByTestId("admin-panel").should(
      "contain.text",
      "No matching tenants found.",
    );

    cy.findByLabelText("Active").click();
    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
    });

    cy.findByRole("navigation", { name: "people-nav" })
      .findAllByRole("link", { name: /Groups/ })
      .should("have.length", 2)
      .first()
      .click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /All Internal Users/ }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: /All External Users/ }).should("not.exist");
    });

    cy.findByRole("navigation", { name: "people-nav" })
      .findAllByRole("link", { name: /Tenant Groups/ })
      .click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /All Internal Users/ }).should("not.exist");
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
        cy.findByRole("link", { name: /All External Users/ }).click();
      });
    });

    cy.findByTestId("admin-panel")
      .findByText(/External Users group and can't be removed from it/)
      .should("exist");
  });

  it("should allow you to manage external user permissions once multi tenancy is enabled", () => {
    const EXTERNAL_USER_GROUP_NAME = "All External Users";
    const TENANT_GROUP_NAME = "Favorite tenant users";

    cy.request("POST", "/api/permissions/group", {
      name: TENANT_GROUP_NAME,
      is_tenant_group: true,
    });

    cy.visit("/admin/permissions");
    cy.findByRole("menuitem", { name: "Administrators" }).should("be.visible");
    cy.findByRole("menuitem", { name: EXTERNAL_USER_GROUP_NAME }).should(
      "not.exist",
    );

    cy.request("PUT", "/api/setting", {
      "use-tenants": true,
    });

    cy.reload();
    cy.findByRole("menuitem", { name: "Administrators" }).should("be.visible");
    cy.findByRole("menuitem", { name: TENANT_GROUP_NAME }).should("be.visible");
    cy.findByRole("menuitem", { name: EXTERNAL_USER_GROUP_NAME }).click();

    assertPermissionTableColumnsExist([
      "exist",
      "exist",
      "exist",
      "not.exist",
      "not.exist",
    ]);

    cy.findByRole("menuitem", { name: "Administrators" }).click();

    assertPermissionTableColumnsExist([
      "exist",
      "exist",
      "exist",
      "exist",
      "exist",
    ]);

    cy.findByRole("radio", { name: "Databases" }).click({ force: true });
    cy.findByRole("menuitem", { name: "Sample Database" }).click();

    assertPermissionTableColumnsExist([
      "exist",
      "exist",
      "exist",
      "exist",
      "exist",
    ]);

    getPermissionRowPermissions("All External Users")
      .eq(3)
      .parent()
      .should("have.attr", "aria-disabled", "true");
    getPermissionRowPermissions("All External Users")
      .eq(4)
      .parent()
      .should("have.attr", "aria-disabled", "true");

    hasGlobeIcon(EXTERNAL_USER_GROUP_NAME);
    hasGlobeIcon(TENANT_GROUP_NAME);
    lacksGlobeIcon("Administrators");
    lacksGlobeIcon("All Internal Users");
  });

  it("should not show send email modal when creating tenant users when SMTP is configured", () => {
    H.setupSMTP();
    cy.request("PUT", "/api/setting", {
      "use-tenants": true,
    });

    createTenants();

    cy.visit("admin/tenants/people");

    cy.findByRole("link", { name: /External Users/ }).click();
    cy.button("Invite someone").click();

    H.modal().within(() => {
      cy.findByRole("textbox", { name: "First name" }).type("Test");
      cy.findByRole("textbox", { name: "Last name" }).type("User");
      cy.findByRole("textbox", { name: "Email" }).type("test.user@email.com");
      cy.findByRole("generic", { name: "Groups" }).should("not.exist");
      cy.findByRole("textbox", { name: "Tenant" }).click();
    });

    H.popover().within(() => {
      cy.findByText("Gizmos").click();
    });

    H.modal().button("Create").click();

    H.modal().should("not.exist");
  });

  it("should show tenant attributes in user attribute lists when multi tenancy is enabled", () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);

    cy.findByRole("switch", { name: /model actions/i }).click({ force: true });
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
      .findByRole("img", { name: /info/ })
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
      .findByRole("img", { name: /info/ });

    cy.visit(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover()
      .findByRole("option", { name: /@tenant.slug/ })
      .findByRole("img", { name: /info/ });

    cy.log("check that tenant attributes propagate to users");

    cy.visit("/admin/tenants/people");
    cy.findByTestId("admin-layout-content").findByText("External Users");
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
      Object.entries(GIZMO_TENANT.attributes).forEach(([key, value]) => {
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
    H.activateToken("bleeding-edge");

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
        .task("signJwt", {
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
    cy.visit("/admin/tenants/people");

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

    cy.findByRole("link", { name: /external users/i }).click();

    // assert that only gizmo users are still active
    cy.findByTestId("admin-layout-content").findByText("1 person found");

    cy.findAllByRole("row")
      .contains("tr", "gizmo user")
      .findByRole("button", { name: /ellipsis/ })
      .click();

    H.popover().findByText("Deactivate user").click();
    H.modal().button("Deactivate").click();

    cy.findByRole("radio", { name: /deactivated/i }).click({ force: true });

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
      .contains("tr", "gizmo user")
      .findByRole("link", { name: /refresh/ })
      .realHover();

    H.tooltip().should("contain.text", "Reactivate this account");

    cy.findByRole("link", { name: /tenants/i }).click();
    cy.findByRole("radio", { name: /deactivated/i }).click({ force: true });

    cy.findAllByRole("row")
      .contains("tr", "doohickey")
      .findByRole("button", { name: /ellipsis/ })
      .click();

    H.popover().findByText("Reactivate tenant").click();
    H.modal().button("Reactivate").click();

    cy.findByRole("link", { name: /external users/i }).click();

    // Only 1 Doohickey user should have been re-activated
    cy.findByTestId("admin-layout-content").findByText("1 person found");

    cy.findAllByRole("row").contains("tr", "doohickey").should("exist");
  });

  it("should accept a tenant when provisioning a user via JWT", () => {
    cy.intercept(`/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
      "notebookData",
    );

    cy.task("signJwt", {
      payload: GIZMO_USER,
      secret: JWT_SECRET,
    }).then((key) =>
      cy.visit(`/auth/sso?return_to=/question/notebook&jwt=${key}`),
    );

    cy.wait("@notebookData");

    H.entityPickerModalItem(2, "Products").click();
    cy.button("Visualize").click();

    cy.get("[data-column-id=CATEGORY]")
      .should("not.contain.text", "Doohickey")
      .should("not.contain.text", "Gadget")
      .should("not.contain.text", "Widget")
      .should("contain.text", "Gizmo");

    cy.task("signJwt", {
      payload: DOOHICKEY_USER,
      secret: JWT_SECRET,
    }).then((key) =>
      cy.visit(`/auth/sso?return_to=/question/notebook&jwt=${key}`),
    );

    cy.wait("@notebookData");

    H.entityPickerModalItem(2, "Products").click();
    cy.button("Visualize").click();

    cy.get("[data-column-id=CATEGORY]")
      .should("not.contain.text", "Gizmo")
      .should("not.contain.text", "Gadget")
      .should("not.contain.text", "Widget")
      .should("contain.text", "Doohickey");

    // User has no write access to any collections. Assert that save button is not rendered

    cy.findByTestId("qb-header-action-panel")
      .findByRole("button", { name: "Save" })
      .should("not.exist");
    cy.findByTestId("qb-header-action-panel")
      .findByTestId("qb-save-button")
      .should("not.exist");

    H.openNavigationSidebar();

    H.navigationSidebar()
      .findByTestId("navbar-new-collection-button")
      .should("not.exist");
    H.navigationSidebar()
      .findByRole("heading", { name: /collections/i })
      .should("not.exist");
    H.navigationSidebar()
      .findByRole("link", { name: /trash/i })
      .should("not.exist");
  });

  it("should create a tenant group and add users to it", () => {
    const GROUP_NAME = "Favorites";
    cy.intercept("POST", "/api/permissions/group").as("createGroup");
    cy.intercept("POST", "/api/user").as("createUser");
    cy.intercept("PUT", "/api/user/*").as("updateUser");
    cy.visit("/admin/tenants/groups");

    // FIXME shouldn't be necessary - caused by slow route guard
    cy.findByTestId("admin-layout-sidebar")
      .findByText(/Tenant Groups/)
      .click();

    cy.findByTestId("admin-layout-content")
      .findByRole("heading", { name: /Tenant Groups/ })
      .should("be.visible");

    cy.button("Create a group").click();
    cy.findByPlaceholderText(/something like/i).type(GROUP_NAME);
    cy.findByRole("button", { name: "Add" }).click();
    cy.wait("@createGroup");
    cy.findByTestId("admin-content-table").findByText(GROUP_NAME);

    cy.findByTestId("admin-layout-sidebar")
      .findByText(/External Users/)
      .click();

    cy.log("put existing user in a group");
    cy.findByTestId("admin-people-list-table")
      .findAllByLabelText("ellipsis icon")
      .first()
      .click();
    H.popover().findByText("Edit user").click();

    H.modal().within(() => {
      cy.findByText("Tenant Groups");
      cy.findByText("All External Users").click();
    });

    H.popover().findByText(GROUP_NAME).click();

    H.modal().within(() => {
      cy.findByText("Tenant Groups").click(); // trigger blur
      cy.findByText("2 other groups").should("be.visible");
      cy.button("Update").click();
    });

    cy.wait("@updateUser").then(
      ({ request: { body: reqBody }, response: { body: resBody } }) => {
        expect(reqBody.user_group_memberships).to.have.length(2);
        expect(resBody.user_group_memberships).to.have.length(2);
      },
    );

    cy.log("add user in a group");
    cy.button("Invite someone").click();

    H.modal().within(() => {
      cy.findByLabelText("First name").type("Misty");
      cy.findByLabelText("Last name").type("Cerulean");
      cy.findByLabelText(/Email/).type("misty@example.com");
      cy.findByLabelText(/Tenant/).click();
    });

    H.popover().findByText(GIZMO_TENANT.name).click();
    H.modal().findByText("All External Users").click();
    H.popover().findByText(GROUP_NAME).click();

    H.modal().within(() => {
      cy.findByText("Tenant Groups").click(); // trigger blur
      cy.findByText("2 other groups").should("be.visible");
      cy.button("Create").click();
    });
    cy.wait("@createUser").then(
      ({ request: { body: reqBody }, response: { body: resBody } }) => {
        expect(reqBody.user_group_memberships).to.have.length(2);
        expect(resBody.user_group_memberships).to.have.length(2);
      },
    );
  });
});

const assertPermissionTableColumnsExist = (assertions) => {
  cy.findByRole("columnheader", { name: "View data" }).should(assertions[0]);
  cy.findByRole("columnheader", { name: "Create queries" }).should(
    assertions[1],
  );
  cy.findByRole("columnheader", { name: /Download results/ }).should(
    assertions[2],
  );
  cy.findByRole("columnheader", { name: "Manage table metadata" }).should(
    assertions[3],
  );
  cy.findByRole("columnheader", { name: "Manage database" }).should(
    assertions[4],
  );
};

function hasGlobeIcon(groupName) {
  cy.findByTestId("permission-table")
    .findByText(groupName)
    .parent()
    .parent()
    .icon("globe")
    .should("be.visible");
}

function lacksGlobeIcon(groupName) {
  cy.findByTestId("permission-table")
    .findByText(groupName)
    .parent()
    .parent()
    .icon("globe")
    .should("not.exist");
}
const createUsers = () => {
  cy.request("GET", "/api/ee/tenant").then(({ body }) => {
    USERS.forEach((user) => {
      const tenantId = body.data.find(
        (tenant) => tenant.slug === user.tenant,
      ).id;

      cy.request("POST", "/api/user", { ...user, tenant_id: tenantId });
    });
  });
};

const createTenants = () => {
  TENANTS.forEach((tenant) => cy.request("POST", "/api/ee/tenant", tenant));
};
