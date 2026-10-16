import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const METRIC_DESCRIPTION = "Revenue from completed orders";

describe("scenarios > data apps > semantic schema", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    H.createLibrarySection("library-metrics").then((metricsCollection) => {
      H.publishTables({ table_ids: [ORDERS_ID] });
      H.createQuestion({
        name: "Revenue",
        description: METRIC_DESCRIPTION,
        type: "metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          filter: [">=", ["field", ORDERS.CREATED_AT, null], "2025-01-01"],
        },
      }).then(({ body: metric }) => {
        // `createQuestion` saves a question and only then sets the metric
        // type, and the Metrics collection accepts nothing but metrics.
        cy.request("PUT", `/api/card/${metric.id}`, {
          collection_id: metricsCollection.id,
        });
      });
    });
  });

  it("tells the author about the filter a metric applies", () => {
    cy.request<string>("GET", "/api/apps/generate/schemas").then(({ body }) => {
      const metadata = H.typedSchemaMetadata(body, "revenue: {");

      expect(metadata.description).to.eq(METRIC_DESCRIPTION);
      expect(metadata.filters).to.satisfy(
        (filters: unknown) =>
          Array.isArray(filters) &&
          filters.some(
            (filter) =>
              typeof filter === "string" && filter.includes("Created At"),
          ),
      );
    });
  });
});
