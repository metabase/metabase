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
      "/embedding/get-started/permissions",
    ],
    ["/admin/embedding/setup-guide/sso", "/embedding/get-started/sso"],
    ["/admin/embedding/guest", "/embedding/security"],
    ["/admin/embedding/security", "/embedding/security"],
    ["/admin/embedding/themes", "/embedding/appearance"],
    [
      "/admin/embedding/themes/some-theme-id",
      "/embedding/appearance/theme/some-theme-id",
    ],
    ["/admin/embedding/modular", "/embedding/security"],
    ["/admin/embedding/interactive", "/embedding/security"],
    ["/admin/settings/embedding-in-other-applications", "/embedding/security"],
    [
      "/admin/settings/embedding-in-other-applications/full-app",
      "/embedding/security",
    ],
    [
      "/admin/settings/embedding-in-other-applications/standalone",
      "/embedding/security",
    ],
    [
      "/admin/settings/embedding-in-other-applications/sdk",
      "/embedding/security",
    ],
  ];

  cases.forEach(([oldPath, newPath]) => {
    it(`redirects ${oldPath} to ${newPath}`, () => {
      cy.visit(oldPath);
      cy.location("pathname").should("eq", newPath);
    });
  });
});
