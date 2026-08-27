const { H } = cy;

describe("scenarios > embedding > admin route redirects (EMB-1526)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  const cases: [string, string][] = [
    ["/admin/embedding", "/embedding/security"],
    ["/admin/embedding/setup-guide", "/embedding/get-started"],
    [
      "/admin/embedding/setup-guide/permissions",
      "/embedding/get-started/permissions-setup",
    ],
    ["/admin/embedding/setup-guide/sso", "/embedding/get-started/sso-setup"],
    ["/admin/embedding/guest", "/embedding/security"],
    ["/admin/embedding/security", "/embedding/security"],
    ["/admin/embedding/themes", "/embedding/appearance"],
    [
      "/admin/embedding/themes/some-theme-id",
      "/embedding/appearance/theme/some-theme-id",
    ],
  ];

  cases.forEach(([oldPath, newPath]) => {
    it(`redirects ${oldPath} to ${newPath}`, () => {
      cy.visit(oldPath);
      cy.location("pathname").should("eq", newPath);
    });
  });

  describe("chained backward-compatibility redirects", () => {
    it("redirects /admin/embedding/modular through /admin/embedding to /embedding/security", () => {
      cy.visit("/admin/embedding/modular");
      cy.location("pathname").should("eq", "/embedding/security");
    });

    it("redirects /admin/settings/embedding-in-other-applications/standalone through /admin/embedding/guest to /embedding/security", () => {
      cy.visit("/admin/settings/embedding-in-other-applications/standalone");
      cy.location("pathname").should("eq", "/embedding/security");
    });
  });
});
