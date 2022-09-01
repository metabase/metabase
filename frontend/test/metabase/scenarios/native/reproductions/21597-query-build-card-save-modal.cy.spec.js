import {
  restore,
  popover,
  modal,
  openNativeEditor,
  addPostgresDatabase,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

const databaseName = "Sample Database";
const databaseCopyName = `${databaseName} copy`;
const secondDatabaseId = SAMPLE_DB_ID + 1;

const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 21597", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("display the relevant error message in save question modal (metabase#21597)", () => {
    cy.intercept("POST", "/api/card").as("saveNativeQuestion");

    // Second DB (copy)
    addPostgresDatabase(databaseCopyName);

    // Create a native query and run it
    openNativeEditor({
      databaseName,
    }).type("SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}", {
      delay: 0,
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
      cy.findByPlaceholderText("What is the name of your card?").type("Q");
      cy.findByText("Save").click();
      cy.wait("@saveNativeQuestion");
      cy.findByText(
        `Invalid Field Filter: Field ${PRODUCTS.CATEGORY} "PRODUCTS"."CATEGORY" belongs to Database ${SAMPLE_DB_ID} "${databaseName}", but the query is against Database ${secondDatabaseId} "${databaseCopyName}"`,
      );
    });
  });
});
