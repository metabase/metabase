const { H } = cy;

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import {
  clickThemeMenuItem,
  createThemeViaApi,
  deleteAllThemes,
} from "./helpers";

describe(
  "scenarios > embedding > themes > theme listing",
  { tags: "@EE" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("lazily seeds Light and Dark on first visit, and preserves admin deletions across reloads", () => {
      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
        cy.log(
          "default Light and Dark themes are seeded lazily on first visit",
        );
        cy.findByText("Light").should("be.visible");
        cy.findByText("Dark").should("be.visible");

        cy.log("new theme card is visible");
        cy.findByRole("button", { name: /New theme/ }).should("be.visible");
      });

      cy.log("admin deletes the seeded defaults");
      deleteAllThemes();
      cy.reload();

      H.main().within(() => {
        cy.log("empty state is shown; defaults are not re-created");
        cy.findByText("Light").should("not.exist");
        cy.findByText("Dark").should("not.exist");

        cy.log("clicking New theme navigates to the draft editor");
        cy.findByRole("button", { name: /New theme/ }).click();
      });

      cy.url().should("match", /\/admin\/embedding\/themes\/new$/);
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

      cy.log("nav label has no upsell gem");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Themes/ })
        .within(() => {
          cy.icon("gem").should("not.exist");
        });

      H.main().within(() => {
        cy.log("theme listing is rendered");
        cy.findByRole("heading", { name: "Themes" }).should("be.visible");

        cy.log("upsell copy is absent");
        cy.findByText("Metabase Pro").should("not.exist");
        cy.findByRole("heading", { name: "Create custom themes" }).should(
          "not.exist",
        );

        cy.findByRole("button", { name: /New theme/ }).click();
      });

      cy.url().should("match", /\/admin\/embedding\/themes\/new$/);

      cy.log("the draft editor has no delete button");
      cy.findByLabelText("Theme name").should("be.visible");
      cy.findByRole("button", { name: /Delete theme/ }).should("not.exist");

      cy.findByRole("button", { name: /Cancel/ }).click();

      cy.log("navigates back to the listing");
      cy.url().should("match", /\/admin\/embedding\/themes$/);

      cy.log("cancelling does not create a theme");
      H.main()
        .findByRole("button", { name: /New theme/ })
        .should("be.visible");
      cy.get("@createTheme.all").should("have.length", 0);

      H.main()
        .findByRole("button", { name: /New theme/ })
        .click();

      cy.findByRole("button", { name: /Save theme/ }).click();

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

    it("can duplicate and delete themes, and open a theme from its card", () => {
      createThemeViaApi("Untitled theme");
      cy.visit("/admin/embedding/themes");

      cy.log("clicking a theme card opens the theme editor");
      H.main().findByText("Untitled theme").click();
      cy.url().should("match", /\/admin\/embedding\/themes\/\d+$/);
      cy.findByLabelText("Theme name").should("have.value", "Untitled theme");

      cy.findByRole("button", { name: /Cancel/ }).click();
      cy.url().should("match", /\/admin\/embedding\/themes$/);

      cy.log("duplicate a theme");
      clickThemeMenuItem("Untitled theme", "Duplicate");

      H.undoToast().findByText("Theme duplicated successfully").should("exist");

      H.main().within(() => {
        cy.log("duplicated theme should have 'Copy of' prepended");
        cy.findByText("Untitled theme").scrollIntoView().should("be.visible");
        cy.findByText("Copy of Untitled theme").should("be.visible");
      });

      cy.log("delete the copy");
      clickThemeMenuItem("Copy of Untitled theme", "Delete");

      cy.log("delete confirmation modal should appear");
      cy.findByRole("dialog").within(() => {
        cy.findByText("Delete theme").should("be.visible");

        cy.findByText(
          "Are you sure you want to delete this theme? This action cannot be undone.",
        ).should("be.visible");

        cy.log("cancel the deletion");
        cy.findByRole("button", { name: /Cancel/ }).click();
      });

      cy.log("theme should still exist");
      H.main().findByText("Copy of Untitled theme").should("be.visible");

      cy.log("confirm deletion");
      clickThemeMenuItem("Copy of Untitled theme", "Delete");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("button", { name: /Delete/ }).click();
      });

      // The duplicate toast may still be on screen, so use the toast list
      // (plural) and filter by text — `undoToast()` (singular) yields
      // undefined when multiple toasts match.
      H.undoToastList().contains("Theme deleted successfully").should("exist");

      H.main().within(() => {
        cy.log("deleted theme is gone; other themes and new theme card remain");
        cy.findByText("Copy of Untitled theme").should("not.exist");
        cy.findByText("Untitled theme").should("be.visible");
        cy.findByRole("button", { name: /New theme/ }).should("be.visible");
        cy.findByText("Light").should("be.visible");
        cy.findByText("Dark").should("be.visible");
      });
    });
  },
);
