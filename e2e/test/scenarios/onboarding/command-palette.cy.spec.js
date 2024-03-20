import {
  restore,
  openCommandPalette,
  commandPalette,
  commandPaletteSearch,
  closeCommandPalette,
} from "e2e/support/helpers";

describe("command palette", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render a searchable command palette", () => {
    cy.visit("/");
    cy.findByAltText("Metabot");

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

      cy.log("Should search entities and docs");
      commandPaletteSearch().type("Orders, Count");

      cy.findByRole("option", { name: /Orders, Count/ }).should("exist");
      cy.findByText('Search documentation for "Orders, Count"').should("exist");

      // Since the command palette list is virtualized, we will search for a few
      // to ensure they're reachable
      commandPaletteSearch().clear().type("People");
      cy.findByRole("option", { name: /Admin - People/ }).should("exist");

      commandPaletteSearch().clear().type("Uploads");
      cy.findByRole("option", { name: /Settings - Uploads/ }).should("exist");
    });

    cy.log("We can close the command palette using escape");
    closeCommandPalette();
    commandPalette().should("not.exist");
  });

  it("should render links to site settings in settings pages", () => {
    cy.visit("/admin");
    cy.findByRole("heading", { name: "Getting set up" }).should("exist");
    openCommandPalette();

    commandPalette().within(() => {
      commandPaletteSearch().type("Name");
      cy.findByRole("option", { name: /Site Name/ }).click();
    });

    cy.location("pathname").should("contain", "settings/general");
    cy.location("hash").should("contain", "#site-name");

    openCommandPalette();

    commandPalette().within(() => {
      commandPaletteSearch().clear().type("Week");
      cy.findByRole("option", { name: /First day of the week/ }).click();
    });

    cy.location("pathname").should("contain", "settings/localization");
    cy.location("hash").should("contain", "#start-of-week");
  });
});
