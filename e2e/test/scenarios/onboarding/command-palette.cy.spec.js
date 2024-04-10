import { USERS } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  openCommandPalette,
  commandPalette,
  commandPaletteSearch,
  closeCommandPalette,
  visitFullAppEmbeddingUrl,
  pressPageDown,
  pressPageUp,
  pressHome,
  pressEnd,
} from "e2e/support/helpers";

const { admin } = USERS;

describe("command palette", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render a searchable command palette", () => {
    //Request to have an item in the recents list
    cy.request(`/api/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.visit("/");

    cy.findByPlaceholderText("Search…").click();

    //Not sure if this is the best way to target this button
    cy.findByRole("button", { name: / \+ K/ }).should("exist").click();

    cy.findByTestId("search-results-floating-container").should("not.exist");
    commandPalette().should("exist");
    closeCommandPalette();

    cy.log("open the command palette with keybinding");
    openCommandPalette();
    commandPalette().within(() => {
      commandPaletteSearch().should("exist");

      cy.log("limit to 5 basic actions");
      cy.findByText("New question");
      cy.findByText("New SQL query");
      cy.findByText("New dashboard");
      cy.findByText("New collection");
      cy.findByText("New model");

      cy.log("Should show recent items");
      cy.findByRole("option", { name: "Orders in a dashboard" }).should(
        "contain.text",
        "Our analytics",
      );

      cy.log("Should search entities and docs");
      commandPaletteSearch().type("Orders, Count");

      cy.findByRole("option", { name: "Orders, Count" }).should(
        "contain.text",
        "Our analytics",
      );

      cy.findByText('Search documentation for "Orders, Count"').should("exist");

      // Since the command palette list is virtualized, we will search for a few
      // to ensure they're reachable
      commandPaletteSearch().clear().type("People");
      cy.findByRole("option", { name: "People" }).should("exist");

      commandPaletteSearch().clear().type("Uploads");
      cy.findByRole("option", { name: "Settings - Uploads" }).should("exist");
      commandPaletteSearch().clear();
    });

    cy.log("We can close the command palette using escape");
    closeCommandPalette();
    commandPalette().should("not.exist");

    openCommandPalette();
    //wait for things to render
    commandPalette()
      .findByRole("option", { name: "New question" })
      .should("exist");

    pressPageDown();
    commandPalette()
      .findByRole("option", { name: "New model" })
      .should("have.attr", "aria-selected", "true");

    pressPageDown();
    commandPalette()
      .findByRole("option", { name: "Orders in a dashboard" })
      .should("have.attr", "aria-selected", "true");

    pressPageUp();
    commandPalette()
      .findByRole("option", { name: "New dashboard" })
      .should("have.attr", "aria-selected", "true");

    pressPageUp();
    commandPalette()
      .findByRole("option", { name: "New question" })
      .should("have.attr", "aria-selected", "true");

    pressEnd();

    commandPalette()
      .findByRole("option", { name: "Orders in a dashboard" })
      .should("have.attr", "aria-selected", "true");

    pressHome();
    commandPalette()
      .findByRole("option", { name: "New question" })
      .should("have.attr", "aria-selected", "true");
  });

  it("should render links to site settings in settings pages", () => {
    cy.visit("/admin");
    cy.findByRole("heading", { name: "Getting set up" }).should("exist");
    openCommandPalette();

    commandPalette().within(() => {
      commandPaletteSearch().type("Nested");
      cy.findByRole("option", { name: "Enable Nested Queries" }).click();
    });

    cy.findByTestId("enable-nested-queries-setting").should("be.visible");

    cy.location("pathname").should("contain", "settings/general");
    cy.location("hash").should("contain", "#enable-nested-queries");

    openCommandPalette();

    commandPalette().within(() => {
      commandPaletteSearch().clear().type("Week");
      cy.findByRole("option", { name: "First day of the week" }).click();
    });

    cy.location("pathname").should("contain", "settings/localization");
    cy.location("hash").should("contain", "#start-of-week");
  });

  it("should not be accessible when doing full app embedding", () => {
    visitFullAppEmbeddingUrl({
      url: "/",
      qs: {
        top_nav: true,
        search: true,
      },
    });

    cy.findByPlaceholderText("Search…").click();
    cy.findByRole("button", { name: / \+ K/ }).should("not.exist");

    cy.get("body").type("{esc}");

    openCommandPalette();
    commandPalette().should("not.exist");
  });

  it("should not be accessible when a user is not logged in", () => {
    cy.intercept("GET", "/api/search**").as("search");
    cy.intercept("GET", "/api/database").as("database");

    cy.signOut();
    cy.visit("/");

    cy.findByRole("heading", { name: "Sign in to Metabase" });

    openCommandPalette();
    commandPalette().should("not.exist");

    cy.get("@database").should("be.null");
    cy.get("@search").should("be.null");

    cy.findByLabelText("Email address").type(admin.email);
    cy.findByLabelText("Password").type(admin.password);
    cy.button("Sign in").click();
    cy.findByTestId("greeting-message");

    openCommandPalette();
    commandPalette().should("exist");
  });
});
