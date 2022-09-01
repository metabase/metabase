import {
  restore,
  popover,
  modal,
  openNativeEditor,
  addPostgresDatabase,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const databaseName = "Sample Database";
const databaseCopyName = `${databaseName} copy`;

const { PRODUCTS } = SAMPLE_DATABASE;

describe("display the relevant error message in save question modal (metabase#21597)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("duplicates the Sample Database DB", () => {
    cy.intercept("POST", "/api/card").as("saveNativeQuestion");

    // Second DB (copy)
    addPostgresDatabase(databaseCopyName);

    // Create a native query and run it
    openNativeEditor({
      databaseName,
    }).type("SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}", {
      parseSpecialCharSequences: false,
    });

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
      `Failed to fetch Field ${PRODUCTS.CATEGORY}: Field does not exist, or belongs to a different Database.`,
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
        `Invalid Field Filter: Field ${PRODUCTS.CATEGORY} "PRODUCTS"."CATEGORY" belongs to Database 1 "${databaseName}", but the query is against Database 2 "${databaseCopyName}"`,
      );
    });
  });
});
