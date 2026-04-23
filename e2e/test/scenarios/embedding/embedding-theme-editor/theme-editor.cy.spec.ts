const { H } = cy;

function createThemeViaApi(name = "Test theme") {
  return cy
    .request("POST", "/api/embed-theme", {
      name,
      settings: {
        colors: {
          brand: "#509EE3",
          background: "#ffffff",
          "text-primary": "#2E353B",
          "text-secondary": "#697D8C",
          "text-tertiary": "#949AAB",
          border: "#EEECEC",
          "background-secondary": "#F9FBFC",
          filter: "#7172AD",
          summarize: "#88BF4D",
          positive: "#84BB4C",
          negative: "#ED6E6E",
          shadow: "#000000",
          charts: [
            "#509EE3",
            "#88BF4D",
            "#A989C5",
            "#EF8C8C",
            "#F9D45C",
            "#F2A86F",
            "#98D9D9",
            "#7172AD",
          ],
        },
        fontFamily: "",
        fontSize: "",
      },
    })
    .then((response) => response.body);
}

function visitThemeEditor(themeId: number) {
  cy.intercept("GET", `/api/embed-theme/${themeId}`).as("getTheme");
  cy.visit(`/admin/embedding/themes/${themeId}`);
  cy.wait("@getTheme");
}

function changeColor(label: string, value: string) {
  H.main().within(() => {
    cy.findByText(label).parent().parent().click();
  });

  H.popover().should("be.visible").find("input").clear().type(value);

  cy.realPress("Escape");
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
        visitThemeEditor(theme.id);
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
        visitThemeEditor(theme.id);
      });

      cy.log("change the theme name");
      cy.findByLabelText("Theme name").clear().type("Updated name");

      cy.log("save button should be enabled");
      cy.findByRole("button", { name: /Save theme/ }).should("be.enabled");

      cy.log("save the theme");
      cy.findByRole("button", { name: /Save theme/ }).click();

      H.undoToast().findByText("Theme saved").should("exist");
    });

    it("can cancel and navigate back to listing", () => {
      createThemeViaApi("A theme").then((theme) => {
        visitThemeEditor(theme.id);
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

    describe("font settings", () => {
      it("can edit font settings and save them", () => {
        cy.intercept("PUT", "/api/embed-theme/*").as("updateTheme");

        createThemeViaApi("Font test").then((theme) => {
          visitThemeEditor(theme.id);
        });

        H.main().within(() => {
          cy.log("font fields should be visible");
          cy.findByLabelText("Font").should("be.visible");
          cy.findByLabelText("Base font size").should("be.visible");
        });

        cy.log("select a font family");
        H.main().findByLabelText("Font").click();
        cy.findByRole("option", { name: "Lato" }).click();

        H.main().within(() => {
          cy.log("set base font size");
          cy.findByLabelText("Base font size").type("16");

          cy.log("save the theme");
          cy.findByRole("button", { name: /Save theme/ }).click();
        });

        cy.wait("@updateTheme").then((interception) => {
          const { settings } = interception.request.body;
          expect(settings.fontFamily).to.eq("Lato");
          expect(settings.fontSize).to.eq("16px");
        });

        H.undoToast().findByText("Theme saved").should("exist");
      });
    });

    describe("main colors", () => {
      it("shows, edits, saves, and reverts main colors", () => {
        cy.intercept("PUT", "/api/embed-theme/*").as("updateTheme");

        createThemeViaApi("Main colors").then((theme) => {
          visitThemeEditor(theme.id);
        });

        cy.log("main color swatches should be visible");
        H.main().within(() => {
          cy.findByText("Main colors").should("be.visible");
          cy.findByText("Brand").should("be.visible");
          cy.findByText("Background").should("be.visible");
          cy.findByText("Primary text").should("be.visible");
        });

        cy.log("change the brand color");
        changeColor("Brand", "FF0000");

        cy.log("revert button should appear after changing a main color");
        H.main()
          .findByLabelText("Revert to default main colors")
          .should("be.visible");

        cy.log("click revert to reset main colors back to defaults");
        H.main().findByLabelText("Revert to default main colors").click();

        cy.log("revert button should disappear after resetting");
        H.main()
          .findByLabelText("Revert to default main colors")
          .should("not.exist");

        cy.log("change the brand color again");
        changeColor("Brand", "FF0000");

        cy.log("save the theme with the changed brand color");
        cy.findByRole("button", { name: /Save theme/ }).click();

        cy.wait("@updateTheme").then((interception) => {
          const { settings } = interception.request.body;
          expect(settings.colors?.brand).to.eq("#ff0000");
        });

        H.undoToast().findByText("Theme saved").should("exist");
      });
    });

    describe("additional colors", () => {
      it("shows additional colors section when expanded", () => {
        createThemeViaApi("Colors test").then((theme) => {
          visitThemeEditor(theme.id);
        });

        H.main().within(() => {
          cy.log("additional colors should be hidden by default");
          cy.findByText("Secondary text").should("not.be.visible");

          cy.log("expand additional colors");
          cy.findByText("Show more colors").click();

          cy.log("additional color rows should be visible");
          cy.findByText("Secondary text").should("be.visible");
          cy.findByText("Border").should("be.visible");
          cy.findByText("Filter").should("be.visible");
          cy.findByText("Chart colors").should("exist");

          cy.log("collapse additional colors");
          cy.findByText("Show fewer colors").click();
          cy.findByText("Secondary text").should("not.be.visible");
        });
      });

      it("can revert additional colors back to defaults", () => {
        createThemeViaApi("Revert colors").then((theme) => {
          visitThemeEditor(theme.id);
        });

        H.main().within(() => {
          cy.findByText("Show more colors").click();

          cy.log(
            "revert button should be visible since the API theme has non-default additional colors",
          );
          cy.findByLabelText("Revert to default additional colors").should(
            "be.visible",
          );

          cy.log("click revert to reset additional colors to defaults");
          cy.findByLabelText("Revert to default additional colors").click();

          cy.log("revert button should disappear after resetting");
          cy.findByLabelText("Revert to default additional colors").should(
            "not.exist",
          );
        });
      });

      it("can edit additional colors and save them", () => {
        cy.intercept("PUT", "/api/embed-theme/*").as("updateTheme");

        createThemeViaApi("Edit colors").then((theme) => {
          visitThemeEditor(theme.id);
        });

        H.main().within(() => {
          cy.findByText("Show more colors").click();
        });

        cy.log("edit the border color via its inline input");
        changeColor("Border", "FF5733");

        cy.log("edit the filter color via its inline input");
        changeColor("Filter", "2D2D30");

        cy.log("save the theme");
        cy.findByRole("button", { name: /Save theme/ }).click();

        cy.wait("@updateTheme").then((interception) => {
          const { settings } = interception.request.body;
          expect(settings.colors?.border).to.eq("#ff5733");
          expect(settings.colors?.filter).to.eq("#2d2d30");
        });

        H.undoToast().findByText("Theme saved").should("exist");
      });
    });

    describe("preview panel", () => {
      it("shows enable embedding prompt when embedding is not enabled", () => {
        H.updateSetting("enable-embedding-simple", false);

        createThemeViaApi("Preview test").then((theme) => {
          visitThemeEditor(theme.id);
        });

        cy.log("should show prompt to enable embedding");
        H.main()
          .findByText(
            "Enable modular embedding to see a live preview of your theme.",
          )
          .should("be.visible");

        H.main()
          .findByRole("button", { name: /Enable modular embedding/ })
          .should("be.visible");
      });

      it("shows theme preview when embedding is enabled", () => {
        H.updateSetting("enable-embedding-simple", true);
        H.updateSetting("show-simple-embed-terms", false);

        createThemeViaApi("Preview test").then((theme) => {
          visitThemeEditor(theme.id);
        });

        cy.log("should show the theme preview heading");
        H.main().findByText("Theme preview").should("be.visible");
      });
    });

    describe("preview picker", () => {
      beforeEach(() => {
        H.updateSetting("enable-embedding-simple", true);
        H.updateSetting("show-simple-embed-terms", false);
      });

      it("defaults to a dashboard and can switch to a question", () => {
        createThemeViaApi("Picker test").then((theme) => {
          visitThemeEditor(theme.id);
        });

        cy.log("picker button shows the default dashboard name");
        H.main()
          .findByLabelText("Change preview resource")
          .should("be.visible")
          .and("contain", "Orders in a dashboard");

        cy.log("preview renders the dashboard web component");
        H.main().find("metabase-dashboard").should("exist");

        cy.log("opens the entity picker modal");
        H.main().findByLabelText("Change preview resource").click();

        H.entityPickerModal().within(() => {
          cy.findByText("Select data to preview").should("be.visible");
          cy.findByText("Our analytics").click();
          cy.findByText("Orders, Count").click();
        });

        cy.log("picker button updates to the selected question");
        H.main()
          .findByLabelText("Change preview resource")
          .should("contain", "Orders, Count");

        cy.log("preview switches to the question web component");
        H.main().find("metabase-question").should("exist");
        H.main().find("metabase-dashboard").should("not.exist");
      });
    });
  },
);
