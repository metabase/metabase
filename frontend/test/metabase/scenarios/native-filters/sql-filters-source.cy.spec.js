import {
  openNativeEditor,
  restore,
  setFilterQuestionSource,
  saveQuestion,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const structuredQuestionDetails = {
  name: "GUI source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
  },
};

const nativeQuestionDetails = {
  name: "SQL source",
  native: {
    query: "select distinct CATEGORY from PRODUCTS order by CATEGORY limit 2",
  },
};

describe("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to use a custom source for a text filter", () => {
    cy.createQuestion(structuredQuestionDetails);

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{tag}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Category" });
    setFilterQuestionSource({ question: "GUI source", field: "Category" });
    saveQuestion("SQL filter");

    FieldFilter.openEntryForm();
    FieldFilter.selectFilterValueFromList("Gadget");
    SQLFilter.runQuery();
  });

  it("should be able to use a custom source for a field filter", () => {
    cy.createNativeQuestion(nativeQuestionDetails);

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT * FROM products WHERE {{tag}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Category" });
    setFilterQuestionSource({ question: "SQL source", field: "CATEGORY" });
    saveQuestion("SQL filter");

    FieldFilter.openEntryForm();
    FieldFilter.selectFilterValueFromList("Gadget");
    SQLFilter.runQuery();
  });
});
