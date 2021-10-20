import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const xlsx = require("xlsx");

const { REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const questionDetails = {
  dataset_query: {
    database: 1,
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
      fields: [["field-id", REVIEWS.ID], ["field-id", REVIEWS.REVIEWER]],
      limit: 5,
    },
  },
  display: "table",
  visualization_settings: {
    column_settings: renameColumns(),
  },
};

const testCases = [
  { type: "csv", sheetName: "Sheet1" },
  { type: "xlsx", sheetName: "Query result" },
];

describe("issue 18382", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should handle the old syntax in downloads (metabase#18382)", () => {
    visitQuestionAdhoc(questionDetails);
    cy.wait("@dataset");

    cy.icon("download").click();

    cy.wrap(testCases).each(({ type, sheetName }) => {
      const downloadClassName = `.Icon-${type}`;
      const endpoint = `/api/dataset/${type}`;

      cy.log(`downloading a ${type} file`);

      cy.get(downloadClassName)
        .parent()
        .parent()
        .get('input[name="query"]')
        .invoke("val")
        .then(download_query_params => {
          cy.request({
            url: endpoint,
            method: "POST",
            form: true,
            body: { query: download_query_params },
            encoding: "binary",
          }).then(resp => {
            const workbook = xlsx.read(resp.body, {
              type: "binary",
            });

            expect(workbook.Sheets[sheetName]["A1"].v).to.eq("MOD:ID");
            expect(workbook.Sheets[sheetName]["B1"].v).to.eq("MOD:Reviewer");
            expect(workbook.Sheets[sheetName]["C1"].v).to.eq("MOD:Title");

            expect(workbook.Sheets[sheetName]["C2"].v).to.eq(
              "Aerodynamic Concrete Bench",
            );
          });
        });
    });
  });
});

function renameColumns() {
  return {
    [`["ref",["field",${REVIEWS.ID},null]]`]: {
      column_title: "MOD:ID",
    },
    [`["ref",["field",${REVIEWS.REVIEWER},null]]`]: {
      column_title: "MOD:Reviewer",
    },
    [`["ref",["field",${PRODUCTS.TITLE},null]]`]: {
      column_title: "MOD:Title",
    },
  };
}
