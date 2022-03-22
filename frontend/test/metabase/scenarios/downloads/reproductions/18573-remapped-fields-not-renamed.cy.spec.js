import {
  restore,
  visitQuestionAdhoc,
  downloadAndAssert,
} from "__support__/e2e/cypress";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: { "source-table": ORDERS_ID, limit: 2 },
    database: SAMPLE_DB_ID,
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
