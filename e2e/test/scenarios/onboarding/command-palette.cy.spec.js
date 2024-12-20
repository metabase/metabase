import { H } from "e2e/support";
import { USERS } from "e2e/support/cypress_data";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { describeEE } from "e2e/support/helpers";

const { admin } = USERS;

describe("command palette", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render a searchable command palette", () => {
    // //Add a description for a check
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      description: "The best question",
    });

    //Request to have an item in the recents list
    cy.request(`/api/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.visit("/");

    cy.findByRole("button", { name: /Search/ }).click();
    H.closeCommandPalette();

    cy.log("open the command palette with keybinding");
    H.openCommandPalette();
    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist");

      cy.log("limit to 5 basic actions");
      cy.findByText("New question");
      cy.findByText("New SQL query");
      cy.findByText("New dashboard");
      cy.findByText("New collection");
      cy.findByText("New model");
      cy.findByText("New metric").should("not.exist");

      cy.log("Should show recent items");
      cy.findByRole("option", { name: "Orders in a dashboard" }).should(
        "contain.text",
        "Our analytics",
      );

      cy.log("Should search entities and docs");
      H.commandPaletteInput().type("Orders, Count");

      cy.findByRole("option", { name: "Orders, Count" })
        .should("contain.text", "Our analytics")
        .should("contain.text", "The best question");

      cy.findByText('Search documentation for "Orders, Count"').should("exist");

      // Since the command palette list is virtualized, we will search for a few
      // to ensure they're reachable
      H.commandPaletteInput().clear().type("People");
      cy.findByRole("option", { name: "People" }).should("exist");

      H.commandPaletteInput().clear().type("Uploads");
      cy.findByRole("option", { name: "Settings - Uploads" }).should("exist");

      // When entering a query, if there are results that come before search results, highlight
      // the first action, otherwise, highlight the first search result
      H.commandPaletteInput().clear().type("For");
      cy.findByRole("option", { name: "Performance" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.findByRole("option", { name: /View and filter/ }).should("exist");

      // Check that we are not filtering search results by action name
      H.commandPaletteInput().clear().type("Company");
      cy.findByRole("option", { name: /View and filter/ }).should("exist");
      cy.findByRole("option", { name: "REVIEWS" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.findByRole("option", { name: "PEOPLE" }).should("exist");
      cy.findByRole("option", { name: "PRODUCTS" }).should("exist");
      H.commandPaletteInput().clear();

      H.commandPaletteInput().clear().type("New met");
      cy.findByText("New metric").should("exist");
    });

    cy.log("We can close the command palette using escape");
    H.closeCommandPalette();
    H.commandPalette().should("not.exist");

    H.openCommandPalette();

    H.commandPalette()
      .findByRole("option", { name: "Orders in a dashboard" })
      .should("have.attr", "aria-selected", "true");

    H.pressPageDown();

    H.commandPalette()
      .findByRole("option", { name: "New dashboard" })
      .should("have.attr", "aria-selected", "true");

    H.pressPageDown();

    H.commandPalette()
      .findByRole("option", { name: "New model" })
      .should("have.attr", "aria-selected", "true");

    H.pressPageUp();
    H.commandPalette()
      .findByRole("option", { name: "New question" })
      .should("have.attr", "aria-selected", "true");

    H.pressEnd();

    H.commandPalette()
      .findByRole("option", { name: "New model" })
      .should("have.attr", "aria-selected", "true");

    H.pressHome();
    H.commandPalette()
      .findByRole("option", { name: "Orders in a dashboard" })
      .should("have.attr", "aria-selected", "true");
  });

  it("should display search results in the order returned by the API", () => {
    cy.visit("/");

    cy.findByRole("button", { name: /Search/ }).click();
    cy.intercept("/api/search?*").as("searchData");

    H.commandPalette().within(() => {
      H.commandPaletteInput().type("Cou");
      cy.wait("@searchData");
      cy.findByText("Loading...").should("not.exist");

      cy.get("@searchData").then(({ response }) => {
        const results = response.body.data;

        results.forEach((result, index) => {
          cy.findAllByRole("option")
            .eq(index + 2)
            .should("contain.text", result.name);
        });
      });
    });
  });

  describe("admin settings links", () => {
    it("should render links to all admin settings pages for admins", () => {
      cy.visit("/");
      cy.findByTestId("home-page")
        .findByText(/see what metabase can do/i)
        .should("exist");

      H.openCommandPalette();
      H.commandPalette().within(() => {
        H.commandPaletteInput().type("Settings -");
        cy.log("check admin sees all settings links");
        H.commandPaletteAction("Settings - Setup").should("exist");
        H.commandPaletteAction("Settings - General").should("exist");
        H.commandPaletteInput().clear();

        cy.log("shouldsee admin links");
        H.commandPaletteInput().type("Performance");
        H.commandPaletteAction("Performance").should("exist");
      });
    });

    it("should not render any links to settings or admin pages for non-admins without privledged access", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.findByTestId("home-page")
        .findByText(/see what metabase can do/i)
        .should("exist");

      H.openCommandPalette();
      H.commandPalette().within(() => {
        cy.log("check normal user does not see any setting links");
        H.commandPaletteInput().type("Settings -");
        H.commandPaletteAction("Settings - Setup").should("not.exist");
        H.commandPaletteAction("Settings - General").should("not.exist");
        H.commandPaletteInput().clear();

        cy.log("should not see admin links");
        H.commandPaletteInput().type("Performance");
        H.commandPaletteAction("Performance").should("not.exist");
        H.commandPaletteInput().clear();

        // Tools and Troubleshooting

        H.commandPaletteInput().type("Troub");
        H.commandPaletteAction("Troubleshooting").should("not.exist");
        H.commandPaletteInput().clear().type("tool");
        H.commandPaletteAction("Tools").should("not.exist");
        H.commandPaletteInput().clear();

        //Database and table metadata

        H.commandPaletteInput().type("data");
        H.commandPaletteAction("Databases").should("not.exist");
        H.commandPaletteInput().clear().type("tabl");
        H.commandPaletteAction("Table Metadata").should("not.exist");
      });
    });

    describeEE("with advanced permissions", () => {
      it("should render links for non-admins that have specific privileges", () => {
        // setup
        cy.log("setup permissions");

        H.setTokenFeatures("all");
        cy.visit("/admin/permissions/application");

        const SETTINGS_INDEX = 0;
        const MONITORING_INDEX = 1;
        H.modifyPermission("All Users", SETTINGS_INDEX, "Yes");
        H.modifyPermission("All Users", MONITORING_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.findByRole("radiogroup").findByText("Data").click();
        cy.findByRole("menuitem", { name: "All Users" }).click();

        const TABLE_METADATA_INDEX = 3;
        const DATABASE_INDEX = 4;

        H.modifyPermission("Sample Database", TABLE_METADATA_INDEX, "Yes");
        H.modifyPermission("Sample Database", DATABASE_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.signInAsNormalUser();

        // test
        cy.visit("/");
        cy.findByTestId("home-page")
          .findByText(/see what metabase can do/i)
          .should("exist");

        H.openCommandPalette();
        H.commandPalette().within(() => {
          // Settings Pages
          H.commandPaletteInput().type("Settings -");
          cy.log(
            "check user with settings permissions see non-admin restricted settings links",
          );
          H.commandPaletteAction("Settings - Setup").should("not.exist");
          H.commandPaletteAction("Settings - General").should("exist");
          H.commandPaletteInput().clear();

          // Tools and Troubleshooting

          H.commandPaletteInput().type("Troub");
          H.commandPaletteAction("Troubleshooting").should("exist");
          H.commandPaletteInput().clear().type("tool");
          H.commandPaletteAction("Tools").should("exist");
          H.commandPaletteInput().clear();

          //Database and table metadata

          H.commandPaletteInput().type("data");
          H.commandPaletteAction("Databases").should("exist");
          H.commandPaletteInput().clear().type("tabl");
          H.commandPaletteAction("Table Metadata").should("exist");
          H.commandPaletteInput().clear();

          cy.log("should not see other admin links");
          H.commandPaletteInput().type("Performance");
          H.commandPaletteAction("Performance").should("not.exist");
        });
      });
    });
  });

  it("should not be accessible when doing full app embedding", () => {
    H.visitFullAppEmbeddingUrl({
      url: "/",
      qs: {
        top_nav: true,
        search: true,
      },
    });

    cy.findByPlaceholderText("Search…").click();
    cy.findByRole("button", { name: / \+ K/ }).should("not.exist");

    cy.get("body").type("{esc}");

    H.openCommandPalette();
    H.commandPalette().should("not.exist");
  });

  it("should not be accessible when a user is not logged in", () => {
    cy.intercept("GET", "/api/search**").as("search");
    cy.intercept("GET", "/api/database").as("database");

    cy.signOut();
    cy.visit("/");

    cy.findByRole("heading", { name: "Sign in to Metabase" });

    H.openCommandPalette();
    H.commandPalette().should("not.exist");

    cy.get("@database").should("be.null");
    cy.get("@search").should("be.null");

    cy.findByLabelText(/Email address/).type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.button("Sign in").click();
    cy.findByTestId("greeting-message");

    H.openCommandPalette();
    H.commandPalette().should("exist");
  });

  it("The Search button should resize when on mobile", () => {
    cy.viewport("iphone-x");
    cy.visit("/");
    H.commandPaletteButton().should("not.contain.text", "search");
  });

  it("Should have a new metric item", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /Search/ }).click();

    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist").type("Me");
      cy.findByText("New metric").should("be.visible").click();

      cy.location("pathname").should("eq", "/metric/query");
    });
  });

  it("should show the 'Report an issue' command palette item", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /Search/ }).click();

    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist").type("Issue");
      cy.findByText("Report an issue").should("be.visible");
    });
  });

  it("The data picker does not cover the command palette (metabase#45469)", () => {
    cy.visit("/");
    cy.log("Click on the New button in the navigation bar and select Question");
    H.newButton("Question").click();
    cy.findByRole("dialog", { name: "Pick your starting data" });
    cy.log("Open the command palette with a shortcut key");
    cy.get("body").type("{ctrl+k}{cmd+k}");
    H.commandPalette().within(() => {
      H.commandPaletteInput().should("be.visible");
    });
  });
});
