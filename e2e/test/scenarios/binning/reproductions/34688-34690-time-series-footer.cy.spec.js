const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const CREATED_AT_BREAKOUT = [
  "field",
  PRODUCTS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const CUSTOM_COLUMN_BREAKOUT = [
  "expression",
  "Custom column",
  { "base-type": "type/Text" },
];

const ID_FIELD_REF = ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }];

const BASE_QUERY = {
  "source-table": PRODUCTS_ID,
  expressions: {
    "Custom column": [
      "case",
      [[["<", ID_FIELD_REF, 10], "Foo"]],
      { default: "Bar" },
    ],
  },
  aggregation: [["count"]],
};

describe("issues 34688 and 34690", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("shows time series footer with a category breakout before or after the temporal one (metabase#34688, metabase#34690)", () => {
    [
      [CUSTOM_COLUMN_BREAKOUT, CREATED_AT_BREAKOUT],
      [CREATED_AT_BREAKOUT, CUSTOM_COLUMN_BREAKOUT],
    ].forEach((breakout) => {
      H.createQuestion(
        {
          database: SAMPLE_DB_ID,
          type: "query",
          query: { ...BASE_QUERY, breakout },
        },
        { visitQuestion: true },
      );

      cy.findByTestId("timeseries-filter-button").should("exist");
      cy.findByTestId("timeseries-bucket-button").should("exist");
    });
  });
});
