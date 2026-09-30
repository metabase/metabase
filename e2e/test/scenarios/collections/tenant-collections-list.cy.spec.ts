const { H } = cy;

interface Tenant {
  name: string;
  slug: string;
}

describe("scenarios > collections > tenant collections list", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.request("PUT", "/api/setting", { "use-tenants": true });
  });

  it("should display active tenant collections", () => {
    const tenants: Tenant[] = Array.from({ length: 3 }, (_, i) => ({
      name: `Tenant ${String(i + 1).padStart(2, "0")}`,
      slug: `tenant-${String(i + 1).padStart(2, "0")}`,
    }));

    cy.log("creating multiple tenants");
    tenants.forEach((tenant) => cy.request("POST", "/api/ee/tenant", tenant));

    cy.log("create tenant to be deactivated");
    cy.request("POST", "/api/ee/tenant", {
      name: "Deactivated Tenant",
      slug: "deactivated-tenant",
    }).then(({ body: tenant }) => {
      cy.log("deactivate the tenant");
      cy.request("PUT", `/api/ee/tenant/${tenant.id}`, { is_active: false });
    });

    cy.visit("/collection/tenant-specific");

    cy.log("all active tenant collections are displayed");
    H.main().within(() => {
      tenants.forEach((tenant) => {
        cy.findByText(tenant.name).should("be.visible");
      });
    });

    cy.log("deactivated tenant should not be visible");
    H.main().findByText("Deactivated Tenant").should("not.exist");

    cy.log("all collections should be clickable links");
    tenants.forEach((tenant) => {
      H.main()
        .findByRole("link", { name: new RegExp(tenant.name) })
        .should("be.visible");
    });

    cy.log("can navigate to tenant collection");
    H.main().findByText("Tenant 01").click();
    cy.url().should("include", "/collection/");
    cy.url().should("not.include", "/collection/tenant-specific");
    H.main().findByText("Tenant collection: Tenant 01").should("be.visible");
  });
});
