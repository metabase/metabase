import {
  restore,
  popover,
  modal,
  openNativeEditor,
  addPostgresDatabase,
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
      url: "/api/card",
      delay: 1000,
    }).as("saveNativeQuestion");

    addPostgresDatabase(databaseCopyName);

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
    cy.findByTestId("qb-header-action-panel")
      .findByText("Save")
      .click();
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
