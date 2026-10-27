const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const CREATED_AT_DAY_OF_WEEK_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "day-of-week",
  },
];

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

  it("can drill through question with temporal extraction breakout without semantic type defined for the column (metabase#23851)", () => {
    cy.log("Reproduces metabase#23851");
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [CREATED_AT_DAY_OF_WEEK_BREAKOUT],
        },
        display: "bar",
      },
      { visitQuestion: true },
    );

    H.chartPathWithFillColor("#509EE3").should("have.length", 7);
    H.chartPathWithFillColor("#509EE3").eq(5).click();
    H.popover().findByText("See these Orders").click();

    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At: Day of week is equal to 6",
    );
    cy.findAllByTestId("cell-data").should("contain", "37.65"); // might change based on a year
    H.openNotebook();
    H.getNotebookStep("filter")
      .findByText("Created At: Day of week is equal to 6")
      .should("exist");
  });
});
