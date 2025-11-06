const { H } = cy;

describe(
  "scenarios > embedding > themes > theme listing",
  { tags: "@EE" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
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

    it("can duplicate a theme", () => {
      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
        cy.log("create a theme");
        cy.findByRole("button", { name: /New theme/ }).click();
        cy.findByText("Untitled theme").should("be.visible");
        cy.findByLabelText("Duplicate and delete").click();
      });

      cy.log("duplicate a theme");
      cy.findByRole("menuitem", { name: /Duplicate/ }).click();

      H.undoToast().findByText("Theme duplicated successfully").should("exist");

      H.main().within(() => {
        cy.log("duplicated theme should have 'Copy of' prepended");
        cy.findByText("Untitled theme").should("be.visible");
        cy.findByText("Copy of Untitled theme").should("be.visible");
      });
    });

    it("can delete a theme with confirmation", () => {
      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
        cy.log("create a theme");
        cy.findByRole("button", { name: /New theme/ }).click();
        cy.findByText("Untitled theme").should("be.visible");
        cy.findByLabelText("Duplicate and delete").click();
      });

      cy.log("delete a theme");
      cy.findByRole("menuitem", { name: /Delete/ }).click();

      cy.log("delete confirmation modal should appear");
      cy.findByRole("dialog").within(() => {
        cy.findByText("Delete theme").should("be.visible");

        cy.findByText(
          "Are you sure you want to delete this theme? This action cannot be undone.",
        ).should("be.visible");

        cy.log("cancel the deletion");
        cy.findByRole("button", { name: /Cancel/ }).click();
      });

      H.main().within(() => {
        cy.log("theme should still exist");
        cy.findByText("Untitled theme").should("be.visible");
        cy.findByLabelText("Duplicate and delete").click();
      });

      cy.log("confirm deletion");
      cy.findByRole("menuitem", { name: /Delete/ }).click();
      cy.findByRole("dialog").within(() => {
        cy.findByRole("button", { name: /Delete/ }).click();
      });

      H.undoToast().findByText("Theme deleted successfully").should("exist");

      H.main().within(() => {
        cy.log("theme should be deleted and show an empty state");
        cy.findByText("Untitled theme").should("not.exist");

        cy.findByText("Create your first theme to get started").should(
          "be.visible",
        );
      });
    });
  },
);
