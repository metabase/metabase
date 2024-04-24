import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  describeWithSnowplow,
  enableTracking,
  echartsContainer,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  openCollectionItemMenu,
  openQuestionActions,
  resetSnowplow,
  restore,
  sidebar,
  visitModel,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const PROMPT = "How many products per category we have?";
const PROMPT_QUERY =
  "SELECT COUNT(*), CATEGORY FROM PRODUCTS GROUP BY CATEGORY";
const MANUAL_QUERY =
  "SELECT COUNT(*), CATEGORY FROM PRODUCTS GROUP BY CATEGORY LIMIT 2";

const MODEL_DETAILS = {
  name: "Products",
  query: {
    "source-table": PRODUCTS_ID,
  },
  type: "model",
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

describe.skip("scenarios > metabot", () => {
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
    cy.intercept("POST", "/api/metabot/feedback", {
      message: "Thanks for your feedback",
    });
  });

  it("should not show metabot if it is disabled", () => {
    cy.visit("/admin");
    sidebar().findByText("Metabot").should("not.exist");

    cy.visit("/metabot/database/1");
    cy.url().should("eq", `${location.origin}/`);

    cy.visit("/metabot/model/1");
    cy.url().should("eq", `${location.origin}/`);
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

describeWithSnowplow.skip("scenarios > metabot", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/metabot/database/*", PROMPT_RESPONSE).as(
      "databasePrompt",
    );
    cy.intercept("POST", "/api/metabot/feedback", {
      message: "Thanks for your feedback",
    });
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events when submitting metabot feedback", () => {
    cy.createQuestion(MODEL_DETAILS);
    enableMetabot();
    resetSnowplow();
    verifyHomeMetabot();
    verifyMetabotFeedback();

    // home page_view
    // metabot page_view
    // metabot_query_run
    // metabot_feedback_received
    // metabot_query_run
    expectGoodSnowplowEvents(5);
  });
});

const enableMetabot = () => {
  cy.request("PUT", "/api/setting/is-metabot-enabled", { value: true });
};

const verifyTableVisibility = () => {
  cy.findByTestId("TableInteractive-root").should("be.visible");
};

const verifyHomeMetabot = () => {
  cy.visit("/");
  cy.findByPlaceholderText(/Ask something/).type(PROMPT);
  cy.findByLabelText("Get Answer").click();
  cy.wait("@databasePrompt");
  cy.wait("@dataset");
  cy.findByDisplayValue(PROMPT).should("be.visible");
  echartsContainer();
  cy.findByText("Gadget").should("be.visible");
  cy.findByText("Widget").should("be.visible");
  cy.findByLabelText("table2 icon").click();
  verifyTableVisibility();
  cy.findByLabelText("bar icon").click();
  echartsContainer();
};

const verifyManualQueryEditing = () => {
  cy.findByText("Open Editor").click();
  cy.findByTestId("native-query-editor")
    .type("{selectall}{backspace}", { delay: 50 })
    .type(MANUAL_QUERY);
  cy.findByLabelText("Refresh").click();
  cy.wait("@dataset");
  echartsContainer();
  cy.findByText("Gadget").should("be.visible");
  cy.findByText("Widget").should("not.exist");
};

const verifyMetabotFeedback = () => {
  cy.findByRole("button", { name: "This isn’t valid SQL." }).click();
  cy.findByRole("button", { name: "Try again" }).click();
  cy.wait("@dataset");
  echartsContainer();
};

const verifyCollectionMetabot = () => {
  cy.visit("/collection/root");
  openCollectionItemMenu(MODEL_DETAILS.name);
  cy.findByText("Ask Metabot").click();
  cy.findByPlaceholderText(/Ask something/).type(PROMPT);
  cy.findByLabelText("Get Answer").click();
  cy.wait("@modelPrompt");
  cy.wait("@dataset");
  echartsContainer();
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
