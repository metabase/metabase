import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Collection } from "metabase-types/api";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

const METRIC_DESCRIPTION = "Revenue from completed orders";

describe("scenarios > data apps > semantic schema", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    H.createLibrary().then(
      ({ body: library }: Cypress.Response<LibraryResponse>) => {
        const metricsCollection = library.effective_children?.find(
          ({ type }) => type === "library-metrics",
        );

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
            collection_id: metricsCollection?.id,
          });
        });
      },
    );
  });

  it("tells the author about the filter a metric applies", () => {
    cy.request<string>(
      "GET",
      "/api/typed-schemas/v1/typescript?include-metric-library=true",
    ).then(({ body }) => {
      const comments = commentsAbove(body, "revenue: {");

      expect(comments).to.include(`// Description: ${METRIC_DESCRIPTION}`);
      expect(comments).to.include("// Filters:");
      expect(
        comments.some(
          (line) => line.startsWith("// - ") && line.includes("Created At"),
        ),
      ).to.eq(true);
    });
  });
});

/** The comment lines directly above the schema entry that opens with `entry`. */
function commentsAbove(body: string, entry: string) {
  const lines = body.split("\n").map((line) => line.trim());
  const comments: string[] = [];

  for (let index = lines.indexOf(entry) - 1; index >= 0; index--) {
    if (!lines[index].startsWith("//")) {
      break;
    }
    comments.unshift(lines[index]);
  }

  return comments;
}
