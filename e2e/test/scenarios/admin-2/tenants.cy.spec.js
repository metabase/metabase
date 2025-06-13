const {
  WRITABLE_DB_ID,
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
} = require("e2e/support/cypress_data");
const {
  COLLECTION_GROUP_ID,
} = require("e2e/support/cypress_sample_instance_data");

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

const { H } = cy;

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
    });

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
      cy.findByText("Parrot").should("exist");
      cy.findByText("Eagle").click();
    });

    H.modal().within(() => {
      cy.findByTestId("mapping-editor").within(() => {
        cy.findByDisplayValue("@tenant.name").should("exist");
        cy.findByDisplayValue("eagle").should("exist");

        cy.findByRole("button", { name: /Add an attribute/i }).click();
        cy.findByPlaceholderText("Key").type("{{ tenant_slug }}", {
          parseSpecialCharSequences: false,
        });

        cy.findByText("This is a restricted key").should("exist");
        cy.button(/close/).click();
      });

      cy.button("Create").click();
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
