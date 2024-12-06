import { H } from "e2e/support";
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
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be possible to add metric to a dashboard via context menu (metabase#44220)", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC).then(
      ({ body: { id: metricId } }) => {
        cy.intercept("POST", "/api/dataset").as("dataset");
        cy.visit(`/metric/${metricId}`);
        cy.wait("@dataset");
        cy.findByTestId("scalar-value").should("have.text", "18,760");

        cy.log("Add metric to a dashboard via context menu");
        H.openQuestionActions();
        H.popover().findByTextEnsureVisible("Add to dashboard").click();
        H.modal().within(() => {
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
        H.saveDashboard();
        H.getDashboardCards().should("have.length", 2);
        cy.findByTestId("scalar-value").should("have.text", "18,760");
      },
    );
  });

  it("should be possible to add metrics to a dashboard", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    H.createQuestion(ORDERS_TIMESERIES_METRIC);
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findByTestId("dashboard-header").within(() => {
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add questions").click();
    });
    cy.findByTestId("add-card-sidebar").within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      cy.findByPlaceholderText("Search…").type(ORDERS_TIMESERIES_METRIC.name);
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).click();
    });
    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
    H.getDashboardCard(2).within(() => {
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      H.echartsContainer().should("be.visible");
    });
  });

  it("should be able to add a filter and drill thru", () => {
    cy.createDashboardWithQuestions({
      questions: [ORDERS_SCALAR_METRIC],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
    });
    H.getDashboardCard().findByText("18,760").should("be.visible");
    cy.findByTestId("dashboard-header").within(() => {
      cy.findByLabelText("Edit dashboard").click();
      cy.findByLabelText("Add a filter or parameter").click();
    });
    H.popover().findByText("Text or Category").click();
    H.getDashboardCard().findByText("Select…").click();
    H.popover().findByText("Category").click();
    H.saveDashboard();
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().within(() => {
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
      H.visitDashboard(dashboard.id);
    });
    H.getDashboardCard().within(() => {
      H.cartesianChartCircle()
        .eq(23) // random dot
        .click({ force: true });
    });
    H.popover().findByText("See these Orders").click();
    H.assertQueryBuilderRowCount(445);
  });

  it("should be able to replace a card with a metric", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.getDashboardCard().realHover().findByLabelText("Replace").click();
    H.modal().within(() => {
      cy.findByText("Metrics").click();
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
    });
    H.undoToastList()
      .last()
      .findByText("Question replaced")
      .should("be.visible");
    H.getDashboardCard().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
    H.getDashboardCard().realHover().findByLabelText("Replace").click();
    H.modal().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("Questions").click();
      cy.findByText("Orders").click();
    });
    H.undoToastList().last().findByText("Metric replaced").should("be.visible");
    H.getDashboardCard().findByText("Orders").should("be.visible");
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
      H.visitDashboard(dashboard.id);
    });
    H.editDashboard();
    H.getDashboardCard().realHover().findByLabelText("Click behavior").click();
    H.sidebar().within(() => {
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });
    H.modal().findByText("Orders").click();
    H.sidebar().findByText("User ID").click();
    H.popover().findByText("Count").click();
    H.sidebar().button("Done").click();
    H.saveDashboard();
    H.getDashboardCard().within(() => {
      H.cartesianChartCircle()
        .eq(5) // random dot
        .click({ force: true });
    });
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("User ID is 92")
      .should("be.visible");
    H.assertQueryBuilderRowCount(8);
  });

  it("should be able to view a model-based metric without data access", () => {
    cy.signInAsAdmin();
    cy.createDashboardWithQuestions({
      questions: [ORDERS_SCALAR_METRIC],
    }).then(({ dashboard }) => {
      cy.signIn("nodata");
      H.visitDashboard(dashboard.id);
    });
    H.getDashboardCard()
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
      H.visitDashboard(dashboard.id);
    });
    H.getDashboardCard()
      .findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
  });
});

function combineAndVerifyMetrics(metric1, metric2) {
  cy.createDashboardWithQuestions({ questions: [metric1] }).then(
    ({ dashboard }) => {
      H.createQuestion(metric2);
      H.visitDashboard(dashboard.id);
    },
  );
  H.editDashboard();
  H.getDashboardCard().realHover().findByTestId("add-series-button").click();
  H.modal().within(() => {
    cy.findByText(metric2.name).click();
    cy.findByLabelText("Legend").within(() => {
      cy.findByText(metric1.name).should("be.visible");
      cy.findByText(metric2.name).should("be.visible");
    });
    cy.button("Done").click();
  });
  H.saveDashboard();
  H.getDashboardCard().within(() => {
    cy.findByLabelText("Legend").within(() => {
      cy.findByText(metric1.name).should("be.visible");
      cy.findByText(metric2.name).should("be.visible");
    });
  });
}
