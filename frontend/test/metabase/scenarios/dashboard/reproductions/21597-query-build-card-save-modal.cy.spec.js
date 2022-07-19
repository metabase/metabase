import {
  restore,
  popover,
  modal,
  openNativeEditor,
} from "__support__/e2e/helpers";

const databaseName = "Sample Database";
const databaseCopyName = `${databaseName} copy`;

describe("display the relevant error message in save question modal (metabase#21597)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.server();
  });

  it("duplicates the Sample Database DB", () => {
    cy.route({
      method: "POST",
      url: "/api/database",
      delay: 1000,
    }).as("createDatabase");
    cy.route({
      method: "POST",
      url: "/api/card",
      delay: 1000,
    }).as("saveNativeQuestion");

    // Second DB (copy)
    cy.visit("/");
    cy.icon("gear").click();
    cy.findByText("Admin settings").click();
    cy.findByText("Databases").click();
    cy.findByText("Add database").click();

    cy.get(".Form-field").findByTestId("select-button").first().click();
    cy.findByText("H2").click();
    cy.get(`input[name="name"]`).type(databaseCopyName);
    cy.get(`input[name="details.db"]`).type(
      "./resources/sample-database.db;USER=GUEST;PASSWORD=guest",
    );

    cy.button("Save").should("not.be.disabled").click();

    cy.wait("@createDatabase");
    cy.findByText("We're taking a look at your database!");
    cy.findByText("Explore sample data");

    // Create a native query
    // and run it
    cy.visit("/");
    openNativeEditor({
      databaseName,
    }).type("SELECT COUNT(*) FROM PRODUCTS WHERE {{}{{}FILTER}}");

    cy.findByTestId("select-button").click();
    popover().within(() => {
      cy.findByText("Field Filter").click();
    });
    popover().within(() => {
      cy.findByText("Products").click();
    });
    popover().within(() => {
      cy.findByText("Category").click();
    });

    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("200");

    // Change DB
    // and re-run the native query
    cy.get(".NativeQueryEditor .GuiBuilder-section")
      .findByText("Sample Database")
      .click();
    popover().within(() => {
      cy.findByText(databaseCopyName).click();
    });
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains(
      "Failed to fetch Field 4: Field does not exist, or belongs to a different Database.",
    );

    // Try to save the native query
    cy.findByTestId("qb-header-action-panel").findByText("Save").click();
    modal().within(() => {
      cy.findByPlaceholderText("What is the name of your card?").type(
        "The question name",
      );
      cy.findByText("Save").click();
      cy.wait("@saveNativeQuestion");
      cy.findByText(
        `Invalid Field Filter: Field 4 "PRODUCTS"."CATEGORY" belongs to Database 1 "${databaseName}", but the query is against Database 2 "${databaseCopyName}"`,
      );
    });
  });
});
