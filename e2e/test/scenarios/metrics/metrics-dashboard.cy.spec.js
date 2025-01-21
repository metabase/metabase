import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

const PRODUCTS_SCALAR_METRIC = {
  name: "Count of products",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const PRODUCTS_TIMESERIES_METRIC = {
  name: "Count of products over time",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line",
};

describe("scenarios > metrics > dashboard", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be possible to add metric to a dashboard via context menu (metabase#44220)", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC).then(
      ({ body: { id: metricId } }) => {
        cy.intercept("POST", "/api/dataset").as("dataset");
        cy.visit(`/metric/${metricId}`);
        cy.wait("@dataset");
        cy.findByTestId("scalar-value").should("have.text", "18,760");

        cy.log("Add metric to a dashboard via context menu");
        cy.openQuestionActions();
        cy.popover().findByTextEnsureVisible("Add to dashboard").click();
        cy.modal().within(() => {
          cy.findByRole("heading", {
            name: "Add this metric to a dashboard",
          }).should("be.visible");
          cy.findByText("Orders in a dashboard").click();
          cy.button("Select").click();
        });

        cy.log("Assert it's been added before the save");
        cy.location("pathname").should(
          "eq",
          `/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard`,
        );
        cy.location("hash").should("eq", `#add=${metricId}&edit`);
        cy.findByTestId("scalar-value").should("have.text", "18,760");

        cy.log("Assert we can save the dashboard with the metric");
        cy.saveDashboard();
        cy.getDashboardCards().should("have.length", 2);
        cy.findByTestId("scalar-value").should("have.text", "18,760");
      },
    );
  });

  it("should be possible to add metrics to a dashboard", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.createQuestion(ORDERS_TIMESERIES_METRIC);
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.editDashboard();
    cy.openQuestionsSidebar();
    cy.findByTestId("add-card-sidebar").within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      cy.findByPlaceholderText("Search…").type(ORDERS_TIMESERIES_METRIC.name);
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).click();
    });
    cy.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
    cy.getDashboardCard(2).within(() => {
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      cy.echartsContainer().should("be.visible");
    });
  });

  it("should be able to add a filter and drill thru", () => {
    cy.createDashboardWithQuestions({
      questions: [ORDERS_SCALAR_METRIC],
    }).then(({ dashboard }) => {
      cy.visitDashboard(dashboard.id);
    });
    cy.getDashboardCard().findByText("18,760").should("be.visible");
    cy.findByTestId("dashboard-header").within(() => {
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add a filter or parameter").click();
    });
    cy.popover().findByText("Text or Category").click();
    cy.getDashboardCard().findByText("Select…").click();
    cy.popover().findByText("Category").click();
    cy.saveDashboard();
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.getDashboardCard().within(() => {
      cy.findByText("4,939").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Product → Category is Gadget")
      .should("be.visible");
    cy.findByTestId("scalar-container")
      .findByText("4,939")
      .should("be.visible");
  });

  it("should be able to add a filter and drill thru without the metric aggregation clause (metabase#42656)", () => {
    cy.createDashboardWithQuestions({
      questions: [ORDERS_TIMESERIES_METRIC],
    }).then(({ dashboard }) => {
      cy.visitDashboard(dashboard.id);
    });
    cy.getDashboardCard().within(() => {
      cy.cartesianChartCircle()
        .eq(23) // random dot
        .click({ force: true });
    });
    cy.popover().findByText("See these Orders").click();
    cy.assertQueryBuilderRowCount(445);
  });

  it("should be able to replace a card with a metric", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.editDashboard();
    cy.getDashboardCard().realHover().findByLabelText("Replace").click();
    cy.modal().within(() => {
      cy.findByText("Metrics").click();
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
    });
    cy.undoToastList()
      .last()
      .findByText("Question replaced")
      .should("be.visible");
    cy.getDashboardCard().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
    cy.getDashboardCard().realHover().findByLabelText("Replace").click();
    cy.modal().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("Questions").click();
      cy.findByText("Orders").click();
    });
    cy.undoToastList()
      .last()
      .findByText("Metric replaced")
      .should("be.visible");
    cy.getDashboardCard().findByText("Orders").should("be.visible");
  });

  it("should be able to combine scalar metrics on a dashcard", () => {
    combineAndVerifyMetrics(ORDERS_SCALAR_METRIC, PRODUCTS_SCALAR_METRIC);
  });

  it("should be able to combine timeseries metrics on a dashcard (metabase#42575)", () => {
    combineAndVerifyMetrics(
      ORDERS_TIMESERIES_METRIC,
      PRODUCTS_TIMESERIES_METRIC,
    );
  });

  it("should be able to use click behaviors with metrics on a dashboard", () => {
    cy.createDashboardWithQuestions({
      questions: [ORDERS_TIMESERIES_METRIC],
    }).then(({ dashboard }) => {
      cy.visitDashboard(dashboard.id);
    });
    cy.editDashboard();
    cy.getDashboardCard().realHover().findByLabelText("Click behavior").click();
    cy.sidebar().within(() => {
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });
    cy.modal().findByText("Orders").click();
    cy.sidebar().findByText("User ID").click();
    cy.popover().findByText("Count").click();
    cy.sidebar().button("Done").click();
    cy.saveDashboard();
    cy.getDashboardCard().within(() => {
      cy.cartesianChartCircle()
        .eq(5) // random dot
        .click({ force: true });
    });
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("User ID is 92")
      .should("be.visible");
    cy.assertQueryBuilderRowCount(8);
  });

  it("should be able to view a model-based metric without data access", () => {
    cy.signInAsAdmin();
    cy.createDashboardWithQuestions({
      questions: [ORDERS_SCALAR_METRIC],
    }).then(({ dashboard }) => {
      cy.signIn("nodata");
      cy.visitDashboard(dashboard.id);
    });
    cy.getDashboardCard()
      .findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
  });

  it("should be able to view a model-based metric without collection access to the source model", () => {
    cy.signInAsAdmin();
    cy.updateCollectionGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        root: "none",
        [FIRST_COLLECTION_ID]: "read",
      },
    });
    cy.createDashboardWithQuestions({
      dashboardDetails: { collection_id: FIRST_COLLECTION_ID },
      questions: [
        {
          ...ORDERS_SCALAR_MODEL_METRIC,
          collection_id: FIRST_COLLECTION_ID,
        },
      ],
    }).then(({ dashboard }) => {
      cy.signIn("nocollection");
      cy.visitDashboard(dashboard.id);
    });
    cy.getDashboardCard()
      .findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
  });
});

function combineAndVerifyMetrics(metric1, metric2) {
  cy.createDashboardWithQuestions({ questions: [metric1] }).then(
    ({ dashboard }) => {
      cy.createQuestion(metric2);
      cy.visitDashboard(dashboard.id);
    },
  );
  cy.editDashboard();
  cy.getDashboardCard().realHover().findByTestId("add-series-button").click();
  cy.modal().within(() => {
    cy.findByText(metric2.name).click();
    cy.findByLabelText("Legend").within(() => {
      cy.findByText(metric1.name).should("be.visible");
      cy.findByText(metric2.name).should("be.visible");
    });
    cy.button("Done").click();
  });
  cy.saveDashboard();
  cy.getDashboardCard().within(() => {
    cy.findByLabelText("Legend").within(() => {
      cy.findByText(metric1.name).should("be.visible");
      cy.findByText(metric2.name).should("be.visible");
    });
  });
}
