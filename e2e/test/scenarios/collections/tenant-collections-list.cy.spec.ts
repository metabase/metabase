const { H } = cy;

interface Tenant {
  name: string;
  slug: string;
}

describe("Tenant Collections List", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.request("PUT", "/api/setting", { "use-tenants": true });
  });

  it("should display tenant collections in a virtualized list", () => {
    // Create 15 tenants to test virtualization
    const tenants: Tenant[] = Array.from({ length: 15 }, (_, i) => ({
      name: `Tenant ${String(i + 1).padStart(2, "0")}`,
      slug: `tenant-${String(i + 1).padStart(2, "0")}`,
    }));

    cy.log("Creating multiple tenants");
    tenants.forEach((tenant) => {
      cy.request("POST", "/api/ee/tenant", tenant);
    });

    cy.log("Visit Tenant Collections page");
    cy.visit("/collection/tenant-specific");

    cy.log("Verify breadcrumbs are displayed");
    H.main().within(() => {
      cy.findByText("Our analytics").should("be.visible");
      cy.findByText("Tenant collections").should("be.visible");
    });

    cy.log("Verify all tenant collections are displayed");
    H.main().within(() => {
      tenants.forEach((tenant) => {
        cy.findByText(tenant.name).should("be.visible");
      });
    });

    cy.log("Verify tenant collections are displayed in a grid layout");
    // Collections should be displayed as cards with folder icons
    cy.get('[role="link"]').should("have.length.at.least", tenants.length);

    cy.log("Test clicking on a tenant collection navigates correctly");
    // Click on the first tenant collection
    H.main().findByText("Tenant 01").click();

    // Should navigate to the collection page
    cy.url().should("include", "/collection/");
    // Should not be on the tenant-specific list page anymore
    cy.url().should("not.include", "/collection/tenant-specific");
  });

  it("should handle scrolling with many tenant collections", () => {
    // Create 30 tenants to ensure virtualization is needed
    const tenants: Tenant[] = Array.from({ length: 30 }, (_, i) => ({
      name: `Company ${String(i + 1).padStart(3, "0")}`,
      slug: `company-${String(i + 1).padStart(3, "0")}`,
    }));

    cy.log("Creating many tenants to test virtualization");
    tenants.forEach((tenant) => {
      cy.request("POST", "/api/ee/tenant", tenant);
    });

    cy.visit("/collection/tenant-specific");

    cy.log("First tenant should be visible immediately");
    H.main().findByText("Company 001").should("be.visible");

    cy.log("scroll to bottom to test virtualization");

    // The last tenant should become visible after scrolling
    H.main().findByText("Company 030").scrollIntoView();
    H.main().findByText("Company 030").should("be.visible");

    cy.log("scroll back to top");
    H.main().findByText("Company 001").scrollIntoView();
    H.main().findByText("Company 001").should("be.visible");

    cy.log("middle items are visible after scrolling");
    H.main().findByText("Company 015").scrollIntoView();
    H.main().findByText("Company 015").should("be.visible");
  });

  it("should show empty state when no tenants exist", () => {
    cy.log("Visit Tenant Collections page with no tenants");
    cy.visit("/collection/tenant-specific");

    cy.log("Verify breadcrumbs are still displayed");
    H.main().within(() => {
      cy.findByText("Our analytics").should("be.visible");
      cy.findByText("Tenant collections").should("be.visible");
    });

    cy.log("No tenant collections should be displayed");
    // The page should render but with no items
    cy.get('[role="link"]').should("have.length", 0);
  });

  it("shows only show active tenants, not deactivated ones", () => {
    cy.log("Create active and deactivated tenants");

    // Create active tenant
    cy.request("POST", "/api/ee/tenant", {
      name: "Active Tenant",
      slug: "active-tenant",
    });

    // Create tenant to be deactivated
    cy.request("POST", "/api/ee/tenant", {
      name: "Deactivated Tenant",
      slug: "deactivated-tenant",
    }).then(({ body: tenant }) => {
      // Deactivate the tenant
      cy.request("PUT", `/api/ee/tenant/${tenant.id}`, {
        status: "inactive",
      });
    });

    cy.visit("/collection/tenant-specific");

    cy.log("Active tenant should be visible");
    H.main().findByText("Active Tenant").should("be.visible");

    cy.log("Deactivated tenant should not be visible");
    H.main().findByText("Deactivated Tenant").should("not.exist");
  });
});
