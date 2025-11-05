import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

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
          expect(settings.colors?.brand).to.eq(whitelabelColors.brand);
          expect(settings.colors?.filter).to.eq(whitelabelColors.filter);
          expect(settings.colors?.summarize).to.eq(whitelabelColors.summarize);
          expect(settings.colors?.charts?.[0]).to.eq(whitelabelColors.accent0);
          expect(settings.colors?.charts?.[7]).to.eq(whitelabelColors.accent7);
        },
      );
    });
  },
);
