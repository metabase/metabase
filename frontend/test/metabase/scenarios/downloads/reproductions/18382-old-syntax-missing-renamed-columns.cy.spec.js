import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const xlsx = require("xlsx");

const { REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

/**
 * This question might seem a bit overwhelming at the first sight.
 * The whole point of this repro was to try to cover as much of the old syntax as possible.
 * We want to make sure it still works when loaded into a new(er) Metabase version.
 */

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
    // Rename columns
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

testCases.forEach(type => {
  const downloadClassName = `.Icon-${type}`;
  const endpoint = `/api/dataset/${type}`;

  describe("issue 18382", () => {
    beforeEach(() => {
      // TODO: Please remove this line when issue gets fixed
      cy.skipOn(type === "csv");

      cy.intercept("POST", "/api/dataset").as("dataset");

      restore();
      cy.signInAsAdmin();

      visitQuestionAdhoc(questionDetails);
      cy.wait("@dataset");
    });

    it(`should handle the old syntax in downloads for ${type} (metabase#18382)`, () => {
      cy.url().then(currentPage => {
        cy.intercept("POST", endpoint, req => {
          // We must redirect in order to avoid Cypress being stuck on waiting for the new page to load.
          // But let's stay on the same page, instead of redirecting to `/` or something else.
          req.redirect(currentPage);
        }).as("fileDownload");
      });

      cy.log(`Downloading ${type} file`);

      cy.icon("download").click();
      // Initiate the file download
      cy.get(downloadClassName).click();

      cy.wait("@fileDownload")
        .its("request")
        .then(req => {
          // The payload for the xlsx is in the binary form
          type === "xlsx" && Object.assign(req, { encoding: "binary" });

          cy.request(req).then(({ body }) => {
            const { SheetNames, Sheets } = xlsx.read(body, {
              type: "binary",
            });

            const sheetName = SheetNames[0];
            const sheet = Sheets[sheetName];

            expect(sheet["A1"].v).to.eq("MOD:Title");
            expect(sheet["B1"].v).to.eq("MOD:ID");
            expect(sheet["C1"].v).to.eq("MOD:Reviewer");

            expect(sheet["A2"].v).to.eq("Aerodynamic Concrete Bench");
          });
        });
    });
  });
});
