import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const question = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    expressions: {
      "Custom column": [
        "case",
        [
          [
            [
              "<",
              [
                "field",
                PRODUCTS.ID,
                {
                  "base-type": "type/BigInteger",
                },
              ],
              10,
            ],
            "Foo",
          ],
        ],
        {
          default: "Bar",
        },
      ],
    },
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        PRODUCTS.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month",
        },
      ],
      [
        "expression",
        "Custom column",
        {
          "base-type": "type/Text",
        },
      ],
    ],
  },
  database: SAMPLE_DB_ID,
};

describe("issue 34690", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("shows time series footer when there is a category breakout (metabase#34690)", () => {
    cy.createQuestion(question, { visitQuestion: true });

    cy.findByTestId("timeseries-filter-button").should("exist");
    cy.findByTestId("timeseries-bucket-button").should("exist");
  });
});
