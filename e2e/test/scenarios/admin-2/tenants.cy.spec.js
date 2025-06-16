const {
  WRITABLE_DB_ID,
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
} = require("e2e/support/cypress_data");
const {
  COLLECTION_GROUP_ID,
  ALL_EXTERNAL_USERS_GROUP_ID,
} = require("e2e/support/cypress_sample_instance_data");

const { STATIC_ORDERS_ID, STATIC_PRODUCTS_ID } = SAMPLE_DB_TABLES;

const { H } = cy;

const JWT_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

const GIZMO_TENANT = {
  name: "Gizmos",
  slug: "gizmo",
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

const TENANTS = [GIZMO_TENANT, DOOHICKEY_TENANT];
const USERS = [GIZMO_USER, DOOHICKEY_USER];

describe("Tenants - management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow users to enable multi tenancy, and create / manage tenants and external users", () => {
    cy.visit("/admin/people");

    cy.findByRole("link", { name: /gear/ }).click();

    H.modal().findByRole("textbox", { name: "User strategy" }).click();
    H.popover().findByText("Multi tenant").click();
    H.modal().button("Close").click();

    cy.findByRole("link", { name: "External Users" }).should("exist");
    cy.findByRole("link", { name: "Tenants" }).click();

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

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");

      cy.findAllByRole("button", { name: /ellipsis/ })
        .eq(1)
        .click();
    });

    // Deactivate a tenant
    H.popover().findByText("Deactivate tenant").click();
    H.modal().button("Deactivate").click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("not.exist");
    });

    cy.findByLabelText("Deactivated").click();

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("not.exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
    });

    // Create an external user
    cy.findByRole("link", { name: "External Users" }).click();
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
      cy.findByTestId("mapping-editor").within(() => {
        cy.findByDisplayValue("@tenant.name").should("exist");
        cy.findByDisplayValue("parrot").should("exist");

        cy.findByRole("button", { name: /Add an attribute/i }).click();
        cy.findByPlaceholderText("Key").type("{{ tenant_slug }}", {
          parseSpecialCharSequences: false,
        });

        cy.findByText("This is a restricted key").should("exist");
        cy.button(/close/).click();
      });

      cy.button("Create").click();
    });

    cy.button("Done").click();

    // Reactivate tenant
    cy.findByRole("link", { name: "Tenants" }).click();
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
  });

  it("should show the tenant attribute in user attribute lists when multi tenancy is enabled", () => {
    H.restore("postgres-writable");

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);

    cy.findByRole("switch", { name: /model actions/i }).click({ force: true });
    cy.findByRole("switch", { name: /database routing/i }).click({
      force: true,
    });

    cy.findByPlaceholderText("Choose an attribute").click();

    H.popover().findByText("@tenant.name").should("not.be.visible");
    cy.visit(
      `/admin/permissions/data/database/${WRITABLE_DB_ID}/impersonated/group/${COLLECTION_GROUP_ID}`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();

    H.popover().findByText("@tenant.name").should("not.be.visible");
    cy.visit(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );

    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover().findByText("@tenant.name").should("not.be.visible");

    cy.request("PUT", "/api/setting/use-tenants", { value: true });

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.findByRole("switch", { name: /database routing/i }).click({
      force: true,
    });
    cy.findByPlaceholderText("Choose an attribute").click();
    H.popover().findByText("@tenant.name").should("be.visible");

    cy.visit(
      `/admin/permissions/data/database/${WRITABLE_DB_ID}/impersonated/group/${COLLECTION_GROUP_ID}`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover().findByText("@tenant.name").should("be.visible");

    cy.visit(
      `/admin/permissions/data/group/${COLLECTION_GROUP_ID}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${STATIC_ORDERS_ID}/segmented`,
    );
    cy.findByPlaceholderText("Pick a user attribute").click();
    H.popover().findByText("@tenant.name").should("be.visible");
  });
});

describe("tenant users", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/setting", {
      "jwt-attribute-email": "email",
      "jwt-attribute-firstname": "first_name",
      "jwt-attribute-lastname": "last_name",
      "jwt-enabled": true,
      "jwt-identity-provider-uri": null,
      "jwt-shared-secret": JWT_SECRET,
      "jwt-user-provisioning-enabled?": true,
      "use-tenants": true,
    });

    TENANTS.forEach((tenant) => cy.request("POST", "/api/ee/tenants", tenant));

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
          "{{ tenant_slug }}": ["variable", ["template-tag", TTAG_NAME]],
        },
      });
    });
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
  });
});
