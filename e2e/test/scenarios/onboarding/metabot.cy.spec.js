import { getNativeQueryEditor, restore } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const TEST_PROMPT = "What's the most popular product category?";
const TEXT_QUERY_1 = "SELECT CATEGORY FROM PRODUCTS LIMIT 1";
const TEXT_QUERY_2 = "SELECT CATEGORY FROM PRODUCTS LIMIT 2";

const TEST_RESPONSE = {
  card: {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: TEXT_QUERY_1,
      },
    },
    display: "table",
    visualization_settings: {},
  },
  prompt_template_versions: [],
};

describe("scenarios > metabot", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
    cy.intercept("POST", "/api/metabot/model/*", TEST_RESPONSE).as(
      "modelPrompt",
    );
    cy.intercept("POST", "/api/metabot/database/*", TEST_RESPONSE).as(
      "databasePrompt",
    );
  });

  it("should allow to ask questions from the home page", () => {
    cy.request("PUT", "/api/card/1", { name: "Products", dataset: true });

    cy.visit("/");
    cy.findByPlaceholderText(
      "Ask something like, how many Products have we had over time?",
    ).type(TEST_PROMPT);
    cy.icon("play").click();
    cy.wait("@databasePrompt");
    cy.findByDisplayValue(TEST_PROMPT).should("be.visible");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("not.exist");

    cy.findByText("Open Editor").click();
    getNativeQueryEditor().invoke("text").should("eq", TEXT_QUERY_1);
    getNativeQueryEditor().type("{selectall}{backspace}").type(TEXT_QUERY_2);
    cy.icon("refresh").click();
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("be.visible");
  });
});
