import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  CardQueryRequest,
  Dataset,
  ListMetricDimensionsResponse,
} from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

type NewDashboardCardQueryRequest = Pick<CardQueryRequest, "dashboard_id">;

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
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

describe("scenarios > metrics > dashboard default dimension", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("admin", { skipCache: true });
  });

  it("uses the default curated dimension without changing the visualization (UXW-4769)", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      cy.request("GET", `/api/metric/${metric.id}`)
        .then(() =>
          cy.request<ListMetricDimensionsResponse>(
            "GET",
            `/api/metric/${metric.id}/dimension`,
          ),
        )
        .then(({ body }) => {
          const productIdDimension = body.added.find(
            (dimension) => dimension.display_name === "Product ID",
          );

          expect(productIdDimension, "Product ID metric dimension").not.to.be
            .undefined;
          if (!productIdDimension) {
            return;
          }

          return cy.request(
            "POST",
            `/api/metric/${metric.id}/dimension/set-default`,
            { dimension_id: productIdDimension.id },
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

          cy.wait<NewDashboardCardQueryRequest, Dataset>(
            "@newMetricQuery",
          ).then(({ request, response }) => {
            expect(request.body.dashboard_id).to.equal(dashboard.id);
            expect(response?.body.data.cols[0].name).to.equal("PRODUCT_ID");
          });

          H.getDashboardCard().within(() => {
            cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
            H.echartsContainer().should("be.visible");
          });
        });
    });
  });
});
