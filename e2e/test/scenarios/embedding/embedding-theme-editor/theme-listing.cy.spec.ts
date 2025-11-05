const { H } = cy;

describe("scenarios > embedding > themes > theme listing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows empty state and allows creating a new theme", () => {
    cy.visit("/admin/embedding/themes");

    cy.log("theme is visible in embedding sidebar");
    cy.findByTestId("admin-layout-sidebar")
      .findByText("Themes")
      .should("be.visible");

    H.main().within(() => {
      cy.log("empty state is visible");
      cy.findByText("Create your first theme to get started").should(
        "be.visible",
      );

      cy.log("create a theme");
      cy.findByRole("button", { name: /New theme/ }).click();

      // TODO(EMB-946): assert that it navigates to the theme editor page.
      cy.log("default card is created");
      cy.findByText("Untitled theme").should("be.visible");

      cy.log("empty state is no longer visible");
      cy.findByText("Create your first theme to get started").should(
        "not.exist",
      );
    });
  });
});
