const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("binning related reproductions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should run a query that breaks out by a temporal column of a joined native question (metabase#18646)", () => {
    cy.log("Reproduces metabase#18646");
    const joinAlias = "18646 - Product";

    H.createNativeQuestion(
      {
        name: "18646",
        native: { query: "select * from products" },
      },
      { loadMetadata: true, wrapId: true },
    );

    cy.get("@questionId").then((cardId) => {
      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                alias: joinAlias,
                "source-table": `card__${cardId}`,
                fields: "all",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  [
                    "field",
                    "ID",
                    { "base-type": "type/BigInteger", "join-alias": joinAlias },
                  ],
                ],
              },
            ],
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                "CREATED_AT",
                {
                  "base-type": "type/DateTimeWithLocalTZ",
                  "join-alias": joinAlias,
                  "temporal-unit": "month",
                },
              ],
            ],
          },
        },
        display: "line",
      });
    });

    H.cartesianChartCircle().should("have.length.greaterThan", 1);
  });
});
