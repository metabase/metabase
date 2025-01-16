import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC = {
  name: "Orders model metric",
  type: "metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Count of orders over time",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
};

describe("scenarios > metrics > question", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to move a metric to a different collection", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC, { visitQuestion: true });
    cy.openQuestionActions();
    cy.popover().findByText("Move").click();
    cy.modal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Move").click();
    });
    cy.undoToast().within(() => {
      cy.findByText(/Metric moved to/).should("be.visible");
      cy.findByText("First collection").should("be.visible");
    });
    cy.queryBuilderHeader().findByText("First collection").should("be.visible");
  });

  it("should be able to add a filter with an ad-hoc question", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC, { visitQuestion: true });
    cy.findByTestId("qb-header-action-panel").button("Filter").click();
    cy.modal().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Gadget").click();
      cy.button("Apply filters").click();
    });
    cy.findByTestId("scalar-container")
      .findByText("4,939")
      .should("be.visible");
  });

  it("should be able to add a custom aggregation expression based on a metric", () => {
    cy.createQuestion(ORDERS_TIMESERIES_METRIC, { visitQuestion: true });
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content")
      .button(ORDERS_TIMESERIES_METRIC.name)
      .click();
    cy.enterCustomColumnDetails({
      formula: `[${ORDERS_TIMESERIES_METRIC.name}] * 2`,
      name: "Expression",
    });
    cy.popover().button("Update").click();
    cy.echartsContainer().findByText("Expression").should("be.visible");
  });

  it("should be able to add a breakout with an ad-hoc question", () => {
    cy.createQuestion(ORDERS_TIMESERIES_METRIC, { visitQuestion: true });
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content").findByText("Category").click();
    cy.echartsContainer().findByText("Product → Category").should("be.visible");
  });

  it("should be able to change the temporal unit when consuming a timeseries metric", () => {
    cy.createQuestion(ORDERS_TIMESERIES_METRIC, { visitQuestion: true });
    cy.assertQueryBuilderRowCount(49);
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content")
      .findByTestId("pinned-dimensions")
      .findByLabelText("Created At")
      .findByText("by month")
      .click();
    cy.popover().findByText("Year").click();
    cy.assertQueryBuilderRowCount(5);
  });

  it("should be able to drill-thru with a metric", () => {
    cy.createQuestion(ORDERS_TIMESERIES_METRIC, { visitQuestion: true });
    cy.cartesianChartCircle()
      .eq(23) // random dot
      .click({ force: true });
    cy.popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });
    cy.wait("@dataset");
    cy.echartsContainer().findByText("User → Source").should("be.visible");
  });

  it("should be able to drill-thru with a metric without the aggregation clause", () => {
    cy.createQuestion(ORDERS_TIMESERIES_METRIC, { visitQuestion: true });
    cy.cartesianChartCircle()
      .eq(23) // random dot
      .click({ force: true });
    cy.popover().findByText("See these Orders").click();
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is Mar 1–31, 2024")
      .should("be.visible");
    cy.assertQueryBuilderRowCount(445);
  });

  it("should be able to view a table-based metric without data access", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      cy.signInAsSandboxedUser();
      cy.visitMetric(card.id, { hasDataAccess: false });
    });
    cy.findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.button("Filter").should("not.exist");
      cy.button("Summarize").should("not.exist");
    });
  });

  it("should be able to view a model-based metric without data access", () => {
    cy.createQuestion(ORDERS_SCALAR_MODEL_METRIC).then(({ body: card }) => {
      cy.signInAsSandboxedUser();
      cy.visitMetric(card.id, { hasDataAccess: false });
    });
    cy.findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.button("Filter").should("not.exist");
      cy.button("Summarize").should("not.exist");
    });
  });

  it("should be able to view a model-based metric without collection access to the source model", () => {
    cy.signInAsAdmin();
    cy.updateCollectionGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        root: "none",
        [FIRST_COLLECTION_ID]: "read",
      },
    });
    cy.createQuestion({
      ...ORDERS_SCALAR_MODEL_METRIC,
      collection_id: FIRST_COLLECTION_ID,
    }).then(({ body: card }) => {
      cy.signIn("nocollection");
      cy.visitMetric(card.id, { hasDataAccess: false });
    });
    cy.findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.button("Filter").should("not.exist");
      cy.button("Summarize").should("not.exist");
    });
  });

  it("should not show 'Replace existing question' option when saving an edited ad-hoc question from a metric (metabase#48555)", () => {
    cy.signInAsNormalUser();
    cy.createQuestion(ORDERS_SCALAR_METRIC, { visitQuestion: true });

    cy.summarize();
    cy.button("Done").click();

    cy.queryBuilderHeader().button("Save").click();
    cy.modal().findByText("Replace or save as new?").should("not.exist");
  });
});
