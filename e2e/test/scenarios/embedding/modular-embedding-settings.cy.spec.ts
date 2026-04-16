const { H } = cy;

describe("scenarios > modular embedding settings", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should link to user strategy when tenants are disabled", () => {
    cy.visit("/admin/embedding/modular");

    H.main()
      .findByText("Tenants")
      .scrollIntoView()
      .should("be.visible")
      .closest("a")
      .should("have.attr", "href", "/admin/people/user-strategy");
  });

  it("should link to tenants page when tenants are enabled", () => {
    H.updateSetting("use-tenants", true);
    cy.visit("/admin/embedding/modular");

    H.main()
      .findByText("Tenants")
      .scrollIntoView()
      .should("be.visible")
      .closest("a")
      .should("have.attr", "href", "/admin/people/tenants");
  });
});
