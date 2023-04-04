import {
  openQuestionActions,
  restore,
  visitQuestion,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const PROMPT = "What's the most popular product category?";
const PROMPT_QUERY = "SELECT CATEGORY FROM PRODUCTS LIMIT 1";
const MANUAL_QUERY = "SELECT CATEGORY FROM PRODUCTS LIMIT 2";

const MODEL_DETAILS = {
  name: "Products",
  query: {
    "source-table": PRODUCTS_ID,
  },
  dataset: true,
};

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
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/metabot/model/*", PROMPT_RESPONSE).as(
      "modelPrompt",
    );
    cy.intercept("POST", "/api/metabot/database/*", PROMPT_RESPONSE).as(
      "databasePrompt",
    );
  });

  it("should allow to submit prompts based on the database", () => {
    cy.createQuestion(MODEL_DETAILS);
    enableMetabot();

    cy.visit("/");
    cy.findByPlaceholderText(/Ask something like/).type(PROMPT);
    cy.findByLabelText("Get Answer").click();
    cy.wait("@databasePrompt");
    cy.wait("@dataset");
    cy.findByDisplayValue(PROMPT).should("be.visible");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("not.exist");

    cy.findByText("Open Editor").click();
    cy.findByTestId("native-query-editor")
      .type("{selectall}{backspace}")
      .type(MANUAL_QUERY);
    cy.findByLabelText("Refresh").click();
    cy.wait("@dataset");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("be.visible");

    cy.findByLabelText("Get Answer").click();
    cy.wait("@databasePrompt");
    cy.wait("@dataset");
    cy.findByText("Gizmo").should("be.visible");
    cy.findByText("Doohickey").should("not.exist");
  });

  it("should allow to submit prompts based on models", () => {
    cy.createQuestion(MODEL_DETAILS, { idAlias: "modelId" });
    enableMetabot();

    cy.visit("/collection/root");
    cy.findByText("Products").click();
    cy.findByLabelText("Move, archive, and more...").click();
    cy.findByText("Ask Metabot").click();
    cy.findByPlaceholderText(/Ask something like/).type(PROMPT);
    cy.findByLabelText("Get Answer").click();
    cy.wait("@modelPrompt");
    cy.wait("@dataset");
    cy.findByText("Gizmo").should("be.visible");

    cy.get("@modelId").then(visitQuestion);
    openQuestionActions();
    cy.findByText("Ask Metabot").click();
    cy.findByPlaceholderText(/Ask something like/).type(PROMPT);
    cy.findByLabelText("Get Answer").click();
    cy.wait("@modelPrompt");
    cy.wait("@dataset");
    cy.findByText("Gizmo").should("be.visible");
  });

  it("should not allow to submit prompts when there are no models", () => {
    enableMetabot();
    cy.visit("/");
    cy.findByPlaceholderText(/Ask something like/).should("not.exist");
  });

  it("should not allow to submit prompts when metabot is not enabled", () => {
    cy.createQuestion(MODEL_DETAILS, { idAlias: "modelId" });

    cy.visit("/");
    cy.findByAltText("Metabot").should("be.visible");
    cy.findByPlaceholderText(/Ask something like/).should("not.exist");

    cy.visit("/collection/root");
    cy.findByText("Products").click();
    cy.findByLabelText("Move, archive, and more...").click();
    cy.findByText("Ask Metabot").should("not.exist");

    cy.get("@modelId").then(visitQuestion);
    openQuestionActions();
    cy.findByText("Ask Metabot").should("not.exist");
  });
});

const enableMetabot = () => {
  cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
};
