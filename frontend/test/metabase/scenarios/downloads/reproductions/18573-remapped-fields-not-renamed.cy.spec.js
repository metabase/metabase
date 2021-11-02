import {
  restore,
  visitQuestionAdhoc,
  downloadAndAssert,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATASET;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: { "source-table": ORDERS_ID, limit: 2 },
    database: 1,
  },
  visualization_settings: {
    column_settings: {
      [`["ref",["field",${ORDERS.PRODUCT_ID},null]]`]: {
        column_title: "Foo",
      },
    },
  },
};

describe.skip("issue 18573", () => {
  beforeEach(() => {
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

  ["csv", "xlsx"].forEach(fileType => {
    it(`for the remapped columns, it should preserve renamed column name in exports for ${fileType} (metabase#18573)`, () => {
      visitQuestionAdhoc(questionDetails);
      cy.wait("@dataset");

      cy.findByText("Foo");
      cy.findByText("Awesome Concrete Shoes");

      downloadAndAssert({ fileType }, assertion);
    });
  });
});

function assertion(sheet) {
  expect(sheet["C1"].v).to.eq("Foo");
  expect(sheet["C2"].v).to.eq("Awesome Concrete Shoes");
}
