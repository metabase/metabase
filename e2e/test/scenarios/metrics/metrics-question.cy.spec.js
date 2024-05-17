import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  assertQueryBuilderRowCount,
  cartesianChartCircle,
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  modal,
  openQuestionActions,
  popover,
  queryBuilderHeader,
  restore,
  undoToast,
  visitMetric,
} from "e2e/support/helpers";

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
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to move a metric to a different collection", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    openQuestionActions();
    popover().findByText("Move").click();
    modal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Move").click();
    });
    undoToast().within(() => {
      cy.findByText(/Metric moved to/).should("be.visible");
      cy.findByText("First collection").should("be.visible");
    });
    queryBuilderHeader().findByText("First collection").should("be.visible");
  });

  it("should be able to add a filter with an ad-hoc question", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Filter").click();
    modal().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Gadget").click();
      cy.button("Apply filters").click();
    });
    cy.findByTestId("scalar-container")
      .findByText("4,939")
      .should("be.visible");
  });

  it("should be able to add a custom aggregation expression based on a metric", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content")
      .button(ORDERS_TIMESERIES_METRIC.name)
      .click();
    enterCustomColumnDetails({
      formula: `[${ORDERS_TIMESERIES_METRIC.name}] * 2`,
      name: "Expression",
    });
    popover().button("Update").click();
    echartsContainer().findByText("Expression").should("be.visible");
  });

  it("should be able to add a breakout with an ad-hoc question", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content").findByText("Category").click();
    echartsContainer().findByText("Product → Category").should("be.visible");
  });

  it("should be able to change the temporal unit when consuming a timeseries metric", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    assertQueryBuilderRowCount(49);
    cy.findByTestId("qb-header-action-panel").button("Summarize").click();
    cy.findByTestId("sidebar-content")
      .findByTestId("pinned-dimensions")
      .findByLabelText("Created At")
      .findByText("by month")
      .click();
    popover().findByText("Year").click();
    assertQueryBuilderRowCount(5);
  });

  it("should be able to drill-thru with a metric", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    cartesianChartCircle()
      .eq(23) // random dot
      .click({ force: true });
    popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });
    cy.wait("@dataset");
    echartsContainer().findByText("User → Source").should("be.visible");
  });

  it("should be able to drill-thru with a metric without the aggregation clause", () => {
    createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    cartesianChartCircle()
      .eq(23) // random dot
      .click({ force: true });
    popover().findByText("See these records").click();
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is Mar 1–31, 2024")
      .should("be.visible");
    assertQueryBuilderRowCount(445);
  });

  it("should be able to view a table-based metric without data access", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      cy.signInAsSandboxedUser();
      visitMetric(card.id, { hasDataAccess: false });
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
    createQuestion(ORDERS_SCALAR_MODEL_METRIC).then(({ body: card }) => {
      cy.signInAsSandboxedUser();
      visitMetric(card.id, { hasDataAccess: false });
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
    createQuestion({
      ...ORDERS_SCALAR_MODEL_METRIC,
      collection_id: FIRST_COLLECTION_ID,
    }).then(({ body: card }) => {
      cy.signIn("nocollection");
      visitMetric(card.id, { hasDataAccess: false });
    });
    cy.findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.button("Filter").should("not.exist");
      cy.button("Summarize").should("not.exist");
    });
  });
});
