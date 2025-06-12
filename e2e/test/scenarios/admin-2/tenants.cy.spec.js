const { H } = cy;

describe("Tenants - management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow users to enable multi tenancy, and create / manage tenants and external users", () => {
    cy.visit("/admin/people");

    cy.findByRole("link", { name: /gear/ }).click();

    H.modal().findByRole("textbox", { name: "User Strategy" }).click();
    H.popover().findByText("Multi tenant").click();
    H.modal().button("Close").click();

    cy.findByRole("link", { name: "External Users" }).should("exist");
    cy.findByRole("link", { name: "Tenants" }).click();

    // Create some tenants
    cy.findByRole("button", { name: "New tenant" }).click();
    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Display name" }).type("Parrot");
      cy.findByRole("textbox", { name: "Slug" }).should("have.value", "parrot");
      cy.button("Create").click;
    });

    cy.findByRole("button", { name: "New tenant" }).click();
    H.modal().within(() => {
      cy.findByRole("textbox", { name: "Display name" }).type("Eagle");
      cy.button("Create").click;
    });

    cy.findByTestId("admin-content-table").within(() => {
      cy.findByRole("link", { name: /Parrot/ }).should("exist");
      cy.findByRole("link", { name: /Eagle/ }).should("exist");
    });

    cy.findByRole("link", { name: "External Users" }).click();
    cy.button("Invite someone").click();

    H.modal(() => {
      cy.findByRole("textbox", { name: "First name" }).type("Test");
      cy.findByRole("textbox", { name: "Last name" }).type("User");
      cy.findByRole("textbox", { name: "Email" }).type("test.user@email.com");
      cy.findByRole("generic", { name: "Groups" }).should("not.exist");
      cy.findByRole("textbox", { name: "Tenant" }).click();
    });

    H.popover(() => {
      cy.findByText("Parrot").should("exist");
      cy.findByText("Eagle").click();
    });

    H.modal(() => {
      cy.findByTestId("mapping-editor").within(() => {
        cy.findByDisplayValue("Tenant").should("exist");
        cy.findByDisplayValue("eagle").should("exist");

        cy.findByRole("button", { name: /Add an attribute/i }).click();
        cy.findByPlaceholderText("key").type("{{ tenant_slug }}");

        cy.findByText("This is a restricted key").should("exist");
        cy.button("close").click();
      });

      cy.button("Create").click();
    });
  });
});
