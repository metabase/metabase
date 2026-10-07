const { H } = cy;

const assertTenantsLink = (href: string) => {
  H.main()
    .findByText("Tenants")
    .scrollIntoView()
    .should("be.visible")
    .closest("a")
    .should("have.attr", "href", href);
};

describe("scenarios > modular embedding settings", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should link to user strategy when tenants are disabled", () => {
    cy.visit("/admin/embedding/modular");
    assertTenantsLink("/admin/people/user-strategy");

    cy.log("setup guide shows the same link");
    cy.visit("/admin/embedding/setup-guide");
    assertTenantsLink("/admin/people/user-strategy");
  });

  it("should link to tenants page when tenants are enabled", () => {
    H.updateSetting("use-tenants", true);
    cy.visit("/admin/embedding/modular");
    assertTenantsLink("/admin/people/tenants");

    cy.log("setup guide shows the same link");
    cy.visit("/admin/embedding/setup-guide");
    assertTenantsLink("/admin/people/tenants");
  });
});
