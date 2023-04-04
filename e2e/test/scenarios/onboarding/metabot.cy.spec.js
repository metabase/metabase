import {
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  openQuestionActions,
  resetSnowplow,
  restore,
  visitModel,
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
    verifyHomeMetabot();
    verifyHomeMetabotEditing();
  });

  it("should allow to submit prompts based on models", () => {
    cy.createQuestion(MODEL_DETAILS, { wrapId: true, idAlias: "modelId" });
    enableMetabot();
    verifyCollectionMetabot();
    verifyQueryBuilderMetabot();
  });

  it("should not allow to submit prompts when there are no models", () => {
    enableMetabot();
    verifyNoHomeMetabot();
  });

  it("should not allow to submit prompts when metabot is not enabled", () => {
    cy.createQuestion(MODEL_DETAILS, { wrapId: true, idAlias: "modelId" });
    verifyNoHomeMetabot();
    verifyNoCollectionMetabot();
    verifyNoQueryBuilderMetabot();
  });

  it("should not allow to submit prompts for a user without native permissions", () => {
    cy.createQuestion(MODEL_DETAILS, { wrapId: true, idAlias: "modelId" });
    enableMetabot();
    cy.signIn("nodata");
    verifyNoHomeMetabot();
    verifyNoCollectionMetabot();
    verifyNoQueryBuilderMetabot({ hasDataAccess: false });
  });
});

describeWithSnowplow("scenarios > metabot", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/metabot/database/*", PROMPT_RESPONSE).as(
      "databasePrompt",
    );
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when submitting metabot feedback", () => {
    cy.createQuestion(MODEL_DETAILS);
    enableMetabot();
    verifyHomeMetabot();
    cy.findByRole("button", { name: "This isn’t valid SQL." }).click();

    // 1 - new_instance_created
    // 2 - pageview
    // 4 - metabot_feedback_received
    expectGoodSnowplowEvents(3);
  });
});

const enableMetabot = () => {
  cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
};

const verifyHomeMetabot = () => {
  cy.visit("/");
  cy.findByPlaceholderText(/Ask something/).type(PROMPT);
  cy.findByLabelText("Get Answer").click();
  cy.wait("@databasePrompt");
  cy.wait("@dataset");
  cy.findByDisplayValue(PROMPT).should("be.visible");
  cy.findByText("Gizmo").should("be.visible");
  cy.findByText("Doohickey").should("not.exist");
};

const verifyHomeMetabotEditing = () => {
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
};

const verifyCollectionMetabot = () => {
  cy.visit("/collection/root");
  cy.findByText("Products").click();
  cy.findByLabelText("Move, archive, and more...").click();
  cy.findByText("Ask Metabot").click();
  cy.findByPlaceholderText(/Ask something/).type(PROMPT);
  cy.findByLabelText("Get Answer").click();
  cy.wait("@modelPrompt");
  cy.wait("@dataset");
  cy.findByText("Gizmo").should("be.visible");
};

const verifyQueryBuilderMetabot = () => {
  cy.get("@modelId").then(id => visitModel(id));
  openQuestionActions();
  cy.findByText("Ask Metabot").click();
  cy.findByPlaceholderText(/Ask something/).type(PROMPT);
  cy.findByLabelText("Get Answer").click();
  cy.wait("@modelPrompt");
  cy.wait("@dataset");
  cy.findByText("Gizmo").should("be.visible");
};

const verifyNoHomeMetabot = () => {
  cy.visit("/");
  cy.findByAltText("Metabot").should("be.visible");
  cy.findByPlaceholderText(/Ask something/).should("not.exist");
};

const verifyNoCollectionMetabot = () => {
  cy.visit("/collection/root");
  cy.findByText("Products").click();
  cy.findByLabelText("Move, archive, and more...").click();
  cy.findByText("Ask Metabot").should("not.exist");
};

const verifyNoQueryBuilderMetabot = ({ hasDataAccess = true } = {}) => {
  cy.get("@modelId").then(id => visitModel(id, { hasDataAccess }));
  openQuestionActions();
  cy.findByText("Ask Metabot").should("not.exist");
};
