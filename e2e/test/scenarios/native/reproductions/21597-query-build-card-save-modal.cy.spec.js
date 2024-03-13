import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  openNativeEditor,
  addPostgresDatabase,
} from "e2e/support/helpers";

const databaseName = "Sample Database";
const databaseCopyName = `${databaseName} copy`;
const secondDatabaseId = SAMPLE_DB_ID + 1;

const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 21597", { tags: "@external" }, () => {
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

    cy.findByTestId("variable-type-select").click();
    popover().within(() => {
      cy.findByText("Field Filter").click();
    });
    popover().within(() => {
      cy.findByText("Products").click();
    });
    popover().within(() => {
      cy.findByText("Category").click();
    });

    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("200");

    // Change DB
    // and re-run the native query
    cy.findByTestId("native-query-editor-container")
      .findByText("Sample Database")
      .click();
    popover().within(() => {
      cy.findByText(databaseCopyName).click();
    });
    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(`Can\'t find field with ID: ${PRODUCTS.CATEGORY}`);

    // Try to save the native query
    cy.findByTestId("qb-header-action-panel").findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByPlaceholderText("What is the name of your question?").type("Q");
      cy.findByText("Save").click();
      cy.wait("@saveNativeQuestion");
      cy.findByText(
        `Invalid Field Filter: Field ${PRODUCTS.CATEGORY} "PRODUCTS"."CATEGORY" belongs to Database ${SAMPLE_DB_ID} "${databaseName}", but the query is against Database ${secondDatabaseId} "${databaseCopyName}"`,
      );
    });
  });
});
