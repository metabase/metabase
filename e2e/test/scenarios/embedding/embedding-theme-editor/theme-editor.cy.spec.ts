const { H } = cy;

function createThemeViaApi(name = "Test theme") {
  return cy
    .request("POST", "/api/embed-theme", {
      name,
      settings: { colors: { brand: "#509EE3" } },
    })
    .then((response) => response.body);
}

describe(
  "scenarios > embedding > themes > theme editor",
  { tags: "@EE" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("loads the theme editor page and shows the theme name", () => {
      createThemeViaApi("My custom theme").then((theme) => {
        cy.visit(`/admin/embedding/themes/${theme.id}`);
      });

      cy.log("editor panel should show the theme name");
      cy.findByLabelText("Theme name").should("have.value", "My custom theme");

      cy.log("sidebar should be hidden on theme editor page");
      cy.findByTestId("admin-layout-sidebar").should("not.exist");

      cy.log("save button should be disabled when no changes");
      cy.findByRole("button", { name: /Save theme/ }).should("be.disabled");
    });

    it("can edit and save a theme name", () => {
      createThemeViaApi("Original name").then((theme) => {
        cy.visit(`/admin/embedding/themes/${theme.id}`);
      });

      cy.log("change the theme name");
      cy.findByLabelText("Theme name").clear().type("Updated name");

      cy.log("save button should be enabled");
      cy.findByRole("button", { name: /Save theme/ }).should("be.enabled");

      cy.log("save the theme");
      cy.findByRole("button", { name: /Save theme/ }).click();

      H.undoToast().findByText("Theme saved").should("exist");

      cy.log("save button should be disabled after save");
      cy.findByRole("button", { name: /Save theme/ }).should("be.disabled");
    });

    it("can cancel and navigate back to listing", () => {
      createThemeViaApi("A theme").then((theme) => {
        cy.visit(`/admin/embedding/themes/${theme.id}`);
      });

      cy.findByRole("button", { name: /Cancel/ }).click();

      cy.log("should navigate back to the themes listing");
      cy.url().should("include", "/admin/embedding/themes");
      cy.url().should("not.match", /\/themes\/\d+/);
    });

    it("shows not found for invalid theme id", () => {
      cy.visit("/admin/embedding/themes/99999");

      H.main().findByText("We're a little lost...").should("be.visible");
    });
  },
);
