import {
  restore,
  visitQuestionAdhoc,
  downloadAndAssert,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

/**
 * This question might seem a bit overwhelming at the first sight.
 * The whole point of this repro was to try to cover as much of the old syntax as possible.
 * We want to make sure it still works when loaded into a new(er) Metabase version.
 */

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": REVIEWS_ID,
      joins: [
        {
          fields: [["joined-field", "Products", ["field-id", PRODUCTS.TITLE]]],
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field-id", REVIEWS.PRODUCT_ID],
            ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
          ],
          alias: "Products",
        },
      ],
      filter: ["and", ["=", ["field-id", REVIEWS.RATING], 4]],
      "order-by": [
        ["asc", ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]]],
      ],
      fields: [
        ["field-id", REVIEWS.ID],
        ["field-id", REVIEWS.REVIEWER],
      ],
      limit: 5,
    },
  },
  display: "table",
  visualization_settings: {
    /**
     * Rename columns
     *
     * Please note: it is currently not possible to use the old syntax for columns rename.
     * That results in `500` error, and backend doesn't handle it at all.
     * Once some kind of mechanism is put in place to prevent the app from breaking in such cases,
     * change the following syntax to the old style `["field-id", ${COLUMN_ID}]`
     */

    column_settings: {
      [`["ref",["field",${REVIEWS.ID},null]]`]: {
        column_title: "MOD:ID",
      },
      [`["ref",["field",${REVIEWS.REVIEWER},null]]`]: {
        column_title: "MOD:Reviewer",
      },
      [`["ref",["field",${PRODUCTS.TITLE},null]]`]: {
        column_title: "MOD:Title",
      },
    },
    // Reorder columns
    "table.columns": [
      {
        name: "TITLE",
        fieldRef: ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]],
        enabled: true,
      },
      {
        name: "ID",
        fieldRef: ["field-id", REVIEWS.ID],
        enabled: true,
      },
      {
        name: "REVIEWER",
        fieldRef: ["field-id", REVIEWS.REVIEWER],
        enabled: true,
      },
    ],
  },
};

const testCases = ["csv", "xlsx"];

testCases.forEach(fileType => {
  describe("issue 18382", () => {
    beforeEach(() => {
      // TODO: Please remove this line when issue gets fixed
      cy.skipOn(fileType === "csv");

      restore();
      cy.signInAsAdmin();

      visitQuestionAdhoc(questionDetails);
    });

    it(`should handle the old syntax in downloads for ${fileType} (metabase#18382)`, () => {
      downloadAndAssert({ fileType }, assertion);
    });
  });
});

function assertion(sheet) {
  expect(sheet["A1"].v).to.eq("MOD:Title");
  expect(sheet["B1"].v).to.eq("MOD:ID");
  expect(sheet["C1"].v).to.eq("MOD:Reviewer");

  expect(sheet["A2"].v).to.eq("Aerodynamic Concrete Bench");
}
