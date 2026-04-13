const { H } = cy;

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

function createThemeViaApi(name = "Test theme") {
  return cy.request("POST", "/api/embed-theme", {
    name,
    settings: { colors: { brand: "#509EE3" } },
  });
}

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
      });

      cy.log("navigates to the theme editor page");
      cy.url().should("match", /\/admin\/embedding\/themes\/\d+/);
    });

    it("navigates to theme editor when clicking an existing theme card", () => {
      createThemeViaApi("My theme");
      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
        cy.findByText("My theme").click();
      });

      cy.log("navigates to the theme editor page");
      cy.url().should("match", /\/admin\/embedding\/themes\/\d+/);
    });

    it("uses white-labeled colors as a base for creating themes", () => {
      const whitelabelColors = {
        brand: "#8e44ad",
        filter: "#16a085",
        summarize: "#d35400",
        accent0: "#e74c3c",
        accent7: "#34495e",
      };

      // @ts-expect-error -- the utility is not aware of enterprise settings
      H.updateSetting("application-colors", whitelabelColors);

      cy.intercept("POST", "/api/embed-theme").as("createTheme");
      cy.visit("/admin/embedding/themes");

      H.main()
        .findByRole("button", { name: /New theme/ })
        .click();

      cy.wait<{ name: string; settings: MetabaseTheme }>("@createTheme").then(
        (interception) => {
          const { name, settings } = interception.request.body;

          expect(name).to.eq("Untitled theme");

          // We capture a snapshot of the current white-labeled colors when creating themes.
          // The internal BI's whitelabeled colors may be different from the embedding colors,
          // so this white-labeled color will stay the same as the appearance settings changes.
          expect(settings.colors?.brand).to.eq(whitelabelColors.brand);
          expect(settings.colors?.filter).to.eq(whitelabelColors.filter);
          expect(settings.colors?.summarize).to.eq(whitelabelColors.summarize);
          expect(settings.colors?.charts?.[0]).to.eq(whitelabelColors.accent0);
          expect(settings.colors?.charts?.[7]).to.eq(whitelabelColors.accent7);
        },
      );
    });

    it("can duplicate a theme", () => {
      createThemeViaApi("Untitled theme");
      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
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
      createThemeViaApi("Untitled theme");
      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
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
