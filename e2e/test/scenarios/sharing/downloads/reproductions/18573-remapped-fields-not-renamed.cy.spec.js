import {
  restore,
  visitQuestionAdhoc,
  downloadAndAssert,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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

describe("issue 18573", () => {
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

  it(`for the remapped columns, it should preserve renamed column name in exports for xlsx (metabase#18573)`, () => {
    visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    downloadAndAssert({ fileType: "xlsx" }, assertion);
  });
});

function assertion(sheet) {
  expect(sheet["C1"].v).to.eq("Foo");
  expect(sheet["C2"].v).to.eq("Awesome Concrete Shoes");
}
