import {
  restore,
  visitQuestionAdhoc,
  downloadAndAssert,
} from "__support__/e2e/cypress";
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

const testCases = ["csv", "xlsx"];

describe("issue 18440", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
  });

  testCases.forEach(type => {
    it(`export should include a column with remapped values for ${type} (metabase#18440)`, () => {
      visitQuestionAdhoc(questionDetails);
      cy.wait("@dataset");

      cy.findByText("Product ID");
      cy.findByText("Awesome Concrete Shoes");

      downloadAndAssert(type, assertion);

      // Save the question using UI
      cy.findByText("Save").click();
      cy.get(".Modal")
        .button("Save")
        .click();

      cy.wait("@saveQuestion").then(({ response: { body: { id } } }) => {
        cy.log(`downloading a ${type} file for a saved question`);

        const endpoint = `/api/card/${id}/query/${type}`;

        cy.request({
          url: endpoint,
          method: "POST",
          encoding: "binary",
        }).then(resp => {
          const { SheetNames, Sheets } = xlsx.read(resp.body, {
            type: "binary",
          });

          const sheetName = SheetNames[0];
          const sheet = Sheets[sheetName];

          assertion(sheet);
        });
      });
    });
  });
});

function assertion(sheet) {
  expect(sheet["C1"].v).to.eq("Product ID");
  expect(sheet["C2"].v).to.eq("Awesome Concrete Shoes");
}
