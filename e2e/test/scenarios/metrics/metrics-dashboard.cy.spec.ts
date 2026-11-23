const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  ListMetricDimensionsResponse,
  MetricId,
} from "metabase-types/api";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Count of orders over time",
  type: "metric" as const,
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
  display: "line" as const,
};

const PRODUCTS_SCALAR_METRIC = {
  name: "Count of products",
  type: "metric" as const,
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const PRODUCTS_TIMESERIES_METRIC = {
  name: "Count of products over time",
  type: "metric" as const,
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
  display: "line" as const,
};

function curateMetricDimension(metricId: MetricId, displayName: string) {
  cy.request("GET", `/api/metric/${metricId}`);
  return cy
    .request<ListMetricDimensionsResponse>({
      method: "GET",
      url: `/api/metric/${metricId}/dimension`,
      qs: { "with-addable": true },
    })
    .then(({ body }) => {
      const dimension = body.addable
        .flatMap(({ dimensions }) => dimensions)
        .find(({ display_name }) => display_name === displayName);

      expect(dimension, `${displayName} metric dimension`).not.to.be.undefined;

      return cy
        .request("POST", `/api/metric/${metricId}/dimension/remove`, {
          dimension_ids: body.added.map(({ id }) => id),
        })
        .then(() =>
          cy.request("POST", `/api/metric/${metricId}/dimension/add`, {
            dimensions: [dimension],
          }),
        );
    });
}

describe("scenarios > metrics > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    // `H.selectDataset` waits on this alias
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should be able to combine scalar metrics on a dashcard", () => {
    H.createDashboardWithQuestions({ questions: [ORDERS_SCALAR_METRIC] }).then(
      ({ dashboard }) => {
        H.createQuestion(PRODUCTS_SCALAR_METRIC);
        H.visitDashboard(dashboard.id);
      },
    );
    H.editDashboard();

    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();
    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(PRODUCTS_SCALAR_METRIC.name);
      cy.findByTestId("visualization-canvas").within(() => {
        // On the funnel and on the horizontal well
        cy.findAllByText(ORDERS_SCALAR_METRIC.name).should("have.length", 2);
        cy.findAllByText(PRODUCTS_SCALAR_METRIC.name).should("exist");
      });
      cy.button("Save").click();
    });
    H.saveDashboard();
    H.getDashboardCard().within(() => {
      // On the funnel and on the horizontal well
      cy.findAllByText(ORDERS_SCALAR_METRIC.name).should("have.length", 2);
      cy.findByText(PRODUCTS_SCALAR_METRIC.name).should("be.visible");
    });
  });

  it("should be able to combine timeseries metrics on a dashcard (metabase#42575)", () => {
    H.createDashboardWithQuestions({
      questions: [ORDERS_TIMESERIES_METRIC],
    }).then(({ dashboard }) => {
      H.createQuestion(PRODUCTS_TIMESERIES_METRIC);
      H.visitDashboard(dashboard.id);
    });
    H.editDashboard();

    H.showDashcardVisualizerModal(0, {
      isVisualizerCard: false,
    });
    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(PRODUCTS_TIMESERIES_METRIC.name);
      H.chartLegendItem(ORDERS_TIMESERIES_METRIC.name).should("exist");
      H.chartLegendItem(PRODUCTS_TIMESERIES_METRIC.name).should("exist");
      cy.button("Save").click();
    });
    H.saveDashboard();
    H.getDashboardCard().within(() => {
      H.chartLegendItem(ORDERS_TIMESERIES_METRIC.name).should("exist");
      H.chartLegendItem(PRODUCTS_TIMESERIES_METRIC.name).should("exist");
    });
  });

  it("should be possible to add a metric to a dashboard via the context menu (metabase#44220)", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC).then(
      ({ body: { id: metricId } }) => {
        H.visitMetric(metricId);
        H.MetricPage.aboutPage().should("be.visible");

        cy.log("Add metric to a dashboard via context menu");
        H.MetricPage.moreMenu().click();
        H.popover().findByTextEnsureVisible("Add to a dashboard").click();
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
        H.getDashboardCard(1).within(() => {
          cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
          cy.findByTestId("visualization-root")
            .should("be.visible")
            .and("have.attr", "data-viz-ui-name", "Number");
          cy.findByTestId("scalar-value").should("have.text", "18,760");
        });

        cy.log("Assert we can save the dashboard with the metric");
        H.saveDashboard();
        H.getDashboardCards().should("have.length", 2);
        H.getDashboardCard(1).within(() => {
          cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
          cy.findByTestId("visualization-root")
            .should("be.visible")
            .and("have.attr", "data-viz-ui-name", "Number");
          cy.findByTestId("scalar-value").should("have.text", "18,760");
        });
      },
    );
  });

  it("should use curated metric dimensions for dashboard filters (UXW-4770)", () => {
    cy.signIn("normal", { skipCache: true });
    H.createDashboardWithQuestions({
      questions: [ORDERS_SCALAR_METRIC],
    }).then(({ dashboard, questions: [metric] }) => {
      curateMetricDimension(metric.id, "Category");
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

  it("should be able to use click behaviors with metrics on a dashboard", () => {
    H.createDashboardWithQuestions({
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
        .eq(5) // sixth point, whose Count of 92 is passed as the User ID
        .click({ force: true });
    });
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("User ID is 92")
      .should("be.visible");
    H.assertQueryBuilderRowCount(8);
  });
});

describe("scenarios > metrics > dashboard default dimension", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("admin", { skipCache: true });
  });

  it("uses the visualization type for the default curated dimension", () => {
    const metricDefinition = {
      ...ORDERS_TIMESERIES_METRIC,
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    };

    H.createQuestion(metricDefinition).then(({ body: metric }) => {
      cy.request("GET", `/api/metric/${metric.id}`)
        .then(() =>
          cy.request<ListMetricDimensionsResponse>(
            "GET",
            `/api/metric/${metric.id}/dimension`,
          ),
        )
        .then(({ body }) => {
          const totalDimension = body.added.find(
            (dimension) => dimension.display_name === "Total",
          );

          expect(totalDimension, "Total metric dimension").not.to.be.undefined;

          return cy.request(
            "POST",
            `/api/metric/${metric.id}/dimension/set-default`,
            { dimension_id: totalDimension?.id },
          );
        })
        .then(() => H.createDashboard())
        .then(({ body: dashboard }) => {
          cy.intercept("POST", `/api/card/${metric.id}/query`).as(
            "newMetricQuery",
          );

          H.visitDashboard(dashboard.id);
          H.editDashboard();
          H.openQuestionsSidebar();
          cy.findByTestId("add-card-sidebar")
            .findByText(ORDERS_TIMESERIES_METRIC.name)
            .click();

          cy.wait("@newMetricQuery").then(({ request, response }) => {
            expect(request.body.dashboard_id).to.equal(dashboard.id);
            expect(response?.body.data.cols[0].name).to.equal("TOTAL");
          });

          H.getDashboardCard().within(() => {
            cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
            cy.findByTestId("visualization-root").should(
              "have.attr",
              "data-viz-ui-name",
              "Bar",
            );
          });

          H.saveDashboard();
          cy.reload();

          H.getDashboardCard()
            .findByTestId("visualization-root")
            .should("have.attr", "data-viz-ui-name", "Bar");
        });
    });
  });
});
