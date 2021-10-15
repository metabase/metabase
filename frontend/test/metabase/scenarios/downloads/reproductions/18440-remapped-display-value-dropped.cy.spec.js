import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const xlsx = require("xlsx");

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATASET;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: { "source-table": ORDERS_ID, limit: 5 },
    database: 1,
  },
};

const testCases = [
  { type: "csv", sheetName: "Sheet1" },
  { type: "xlsx", sheetName: "Query result" },
];

describe("issue 18440", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("saveQuestion");

    restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    visitQuestionAdhoc(questionDetails);
  });

  it("export should include a column with remapped values (metabase#18440)", () => {
    cy.findByText("Product ID");
    cy.findByText("Awesome Concrete Shoes");

    cy.icon("download").click();

    cy.wrap(testCases).each(({ type, sheetName }) => {
      cy.log(`downloading a ${type} file for an unsaved question`);

      const downloadClassName = `.Icon-${type}`;
      const endpoint = `/api/dataset/${type}`;

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
              raw: true,
            });

            expect(workbook.Sheets[sheetName]["C1"].v).to.eq("Product ID");
            expect(workbook.Sheets[sheetName]["C2"].v).to.eq(
              "Awesome Concrete Shoes",
            );
          });
        });
    });

    // Save the question using UI
    cy.findByText("Save").click();
    cy.get(".Modal")
      .button("Save")
      .click();

    cy.wait("@saveQuestion").then(({ response: { body: { id } } }) => {
      cy.wrap(testCases).each(({ type, sheetName }) => {
        cy.log(`downloading a ${type} file for a saved question`);

        const endpoint = `/api/card/${id}/query/${type}`;

        cy.request({
          url: endpoint,
          method: "POST",
          encoding: "binary",
        }).then(resp => {
          const workbook = xlsx.read(resp.body, {
            type: "binary",
            raw: true,
          });

          expect(workbook.Sheets[sheetName]["C1"].v).to.eq("Product ID");
          expect(workbook.Sheets[sheetName]["C2"].v).to.eq(
            "Awesome Concrete Shoes",
          );
        });
      });
    });
  });
});
