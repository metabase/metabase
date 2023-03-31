import { restore } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const PROMPT = "What's the most popular product category?";
const PROMPT_QUERY = "SELECT CATEGORY FROM PRODUCTS LIMIT 1";
const MANUAL_QUERY = "SELECT CATEGORY FROM PRODUCTS LIMIT 2";

const PROMPT_RESPONSE = {
  card: {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: PROMPT_QUERY,
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
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/metabot/model/*", PROMPT_RESPONSE).as(
      "modelPrompt",
    );
    cy.intercept("POST", "/api/metabot/database/*", PROMPT_RESPONSE).as(
      "databasePrompt",
    );
  });

  it("should allow to ask questions from the home page", () => {
    cy.request("PUT", "/api/card/1", { name: "Products", dataset: true });

    cy.visit("/");
    cy.findByPlaceholderText(
      "Ask something like, how many Products have we had over time?",
    ).type(PROMPT);
    cy.findByRole("button", { name: "play icon" }).click();
    cy.wait("@databasePrompt");
    cy.wait("@dataset");
    cy.findByDisplayValue(PROMPT).should("be.visible");
    cy.findByText(PROMPT_QUERY).should("not.exist");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("not.exist");

    cy.findByText("Open Editor").click();
    cy.findByTestId("native-query-editor")
      .type("{selectall}{backspace}")
      .type(MANUAL_QUERY);
    cy.findByRole("button", { name: "refresh icon" }).click();
    cy.wait("@dataset");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("be.visible");

    cy.findByRole("button", { name: "play icon" }).click();
    cy.wait("@databasePrompt");
    cy.wait("@dataset");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("not.exist");
    cy.findByText("Open Editor").click();
  });
});
