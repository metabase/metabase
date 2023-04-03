import { openQuestionActions, popover, restore } from "e2e/support/helpers";
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
    cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/metabot/model/*", PROMPT_RESPONSE);
    cy.intercept("POST", "/api/metabot/database/*", PROMPT_RESPONSE);
  });

  it("should allow to ask questions from the home page", () => {
    cy.createQuestion(MODEL_DETAILS);
    cy.visit("/");
    runMetabotQuery(PROMPT);
    verifyMetabotResults();

    cy.findByText("Open Editor").click();
    runQuestionQuery(MANUAL_QUERY);
    verifyQuestionResults();

    runMetabotQuery(PROMPT);
    verifyMetabotResults();
  });

  it("should allow to ask questions from the query builder", () => {
    cy.createQuestion(MODEL_DETAILS, { visitQuestion: true });
    openQuestionActions();
    popover().findByText("Ask Metabot").click();
    runMetabotQuery(PROMPT);
    verifyMetabotResults();
  });

  it("should allow to ask questions from collection views", () => {
    cy.createQuestion(MODEL_DETAILS);
    cy.visit("/collection/root");
    openCollectionItemMenu(MODEL_DETAILS.name);
    popover().findByText("Ask Metabot").click();
    runMetabotQuery(PROMPT);
    verifyMetabotResults();
  });
});

const runMetabotQuery = prompt => {
  cy.findByPlaceholderText(/Ask something/)
    .clear()
    .type(prompt);
  cy.findByRole("button", { name: "play icon" }).click();
  cy.wait("@dataset");
  cy.findByDisplayValue(prompt).should("be.visible");
};

const verifyMetabotResults = () => {
  cy.findByText("Gizmo").should("be.visible");
  cy.findByText("Doohickey").should("not.exist");
};

const runQuestionQuery = query => {
  cy.findByTestId("native-query-editor")
    .type("{selectall}{backspace}")
    .type(query);
  cy.findByRole("button", { name: "refresh icon" }).click();
  cy.wait("@dataset");
};

const verifyQuestionResults = () => {
  cy.findByText("Gizmo").should("be.visible");
  cy.findByText("Doohickey").should("be.visible");
};

const openCollectionItemMenu = item => {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
};
