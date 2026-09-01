const { H } = cy;

describe("scenarios > embedding > admin route redirects (EMB-1526)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  // admin/routes.unit.spec.tsx asserts the whole retired-path -> hub table off
  // the route tree. This covers the part reading the tree cannot: that a
  // redirect actually fires in a browser, and that it carries its params over.
  it("redirects retired admin embedding URLs to the hub", () => {
    cy.visit("/admin/embedding");
    cy.location("pathname").should("eq", "/embedding/security");

    cy.visit("/admin/embedding/themes/some-theme-id");
    cy.location("pathname").should(
      "eq",
      "/embedding/appearance/theme/some-theme-id",
    );
  });
});
