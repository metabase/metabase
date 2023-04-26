import {
  restore,
  downloadAndAssert,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month-of-year" }],
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ],
      limit: 2,
    },
    type: "query",
  },
  display: "line",
};

describe("issue 18729", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  ["csv", "xlsx"].forEach(fileType => {
    it(`should properly format the 'X of Y'dates in ${fileType} exports (metabase#18729)`, () => {
      visitQuestionAdhoc(questionDetails);

      downloadAndAssert({ fileType }, assertion);
    });
  });
});

function assertion(sheet) {
  // It currently says only "Created At", but that is already covered in an issue #18219.

  // TODO: When 18219 gets fixed, uncomment the following assertion and delete the `contain` one.
  // expect(sheet["A1"].v).to.eq("Created At: Month of year");
  expect(sheet["A1"].v).to.contain("Created At");

  // Based on how this issue gets resolved, the following assertions might need to change!

  expect(sheet["A2"].v).to.eq(1);
  expect(sheet["A2"].t).to.eq("n");
  // Parsed values are always in the form of a string
  expect(sheet["A2"].w).to.eq("1");
}
