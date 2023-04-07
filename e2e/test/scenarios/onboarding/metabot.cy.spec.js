import {
  describeWithSnowplow,
  enableTracking,
  ensureDcChartVisibility,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  openCollectionItemMenu,
  openQuestionActions,
  resetSnowplow,
  restore,
  visitModel,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const PROMPT = "How many products per category we have?";
const PROMPT_QUERY =
  "SELECT COUNT(*), CATEGORY FROM PRODUCTS GROUP BY CATEGORY";
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
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["count"],
      "graph.metrics": ["CATEGORY"],
      "graph.x_axis.scale": "ordinal",
    },
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
    verifyManualQueryEditing();
    verifyMetabotFeedback();
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
    verifyMetabotFeedback();

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
  cy.findByLabelText("table2 icon").click();
  cy.findByLabelText("bar icon").click();
};

const verifyManualQueryEditing = () => {
  cy.findByText("Open Editor").click();
  cy.findByTestId("native-query-editor")
    .type("{selectall}{backspace}", { delay: 50 })
    .type(MANUAL_QUERY);
  cy.findByLabelText("Refresh").click();
  cy.wait("@dataset");
  cy.findByLabelText("table2 icon").should("not.exist");
  cy.findByLabelText("bar icon").should("not.exist");
};

const verifyMetabotFeedback = () => {
  cy.findByRole("button", { name: "This isn’t valid SQL." }).click();
  cy.findByRole("button", { name: "Try again" }).click();
  cy.wait("@dataset");
  ensureDcChartVisibility();
  cy.findByLabelText("table2 icon").click();
  cy.findByTestId("TableInteractive-root").should("be.visible");
  cy.findByLabelText("bar icon").click();
  ensureDcChartVisibility();
};

const verifyCollectionMetabot = () => {
  cy.visit("/collection/root");
  openCollectionItemMenu(MODEL_DETAILS.name);
  cy.findByText("Ask Metabot").click();
  cy.findByPlaceholderText(/Ask something/).type(PROMPT);
  cy.findByLabelText("Get Answer").click();
  cy.wait("@modelPrompt");
  cy.wait("@dataset");
  ensureDcChartVisibility();
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
  openCollectionItemMenu(MODEL_DETAILS.name);
  cy.findByText("Ask Metabot").should("not.exist");
};

const verifyNoQueryBuilderMetabot = ({ hasDataAccess = true } = {}) => {
  cy.get("@modelId").then(id => visitModel(id, { hasDataAccess }));
  openQuestionActions();
  cy.findByText("Ask Metabot").should("not.exist");
};
