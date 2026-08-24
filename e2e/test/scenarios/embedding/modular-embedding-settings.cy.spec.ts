const { H } = cy;

describe("scenarios > modular embedding settings", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should link to user strategy when tenants are disabled", () => {
    cy.visit("/embedding/security");

    H.main()
      .findByText("Tenants")
      .scrollIntoView()
      .should("be.visible")
      .closest("a")
      .should("have.attr", "href", "/admin/people/user-strategy");
  });

  it("should link to tenants page when tenants are enabled", () => {
    H.updateSetting("use-tenants", true);
    cy.visit("/embedding/security");

    H.main()
      .findByText("Tenants")
      .scrollIntoView()
      .should("be.visible")
      .closest("a")
      .should("have.attr", "href", "/admin/people/tenants");
  });
});
