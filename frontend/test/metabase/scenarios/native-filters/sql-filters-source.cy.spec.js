import {
  openNativeEditor,
  restore,
  setFilterQuestionSource,
  saveQuestion,
  popover,
  visitIframe,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const structuredQuestionDetails = {
  name: "MBQL source",
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
    query: "SELECT '1018947080336' EAN UNION ALL SELECT '7663515285824'",
  },
};

describe("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  });

  it("should be able to use a structured question source", () => {
    cy.createQuestion(structuredQuestionDetails);

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("select * from PRODUCTS where {{tag}}");
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Category" });
    setFilterQuestionSource({ question: "MBQL source", field: "Category" });
    saveQuestion("SQL filter");
    FieldFilter.openEntryForm();
    FieldFilter.selectFilterValueFromList("Gadget");
    SQLFilter.runQuery();

    enableSharing();
    setParameterType({ name: "Tag", type: "Editable" });
    publishQuestion();
    visitIframe();
    FieldFilter.openEntryForm();
    FieldFilter.selectFilterValueFromList("Gadget");
  });

  it("should be able to use a native question source", () => {
    cy.createNativeQuestion(nativeQuestionDetails);

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("select * from PRODUCTS where {{tag}}");
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Ean" });
    setFilterQuestionSource({ question: "SQL source", field: "EAN" });
    saveQuestion("SQL filter");
    FieldFilter.openEntryForm();
    FieldFilter.selectFilterValueFromList("1018947080336");
    SQLFilter.runQuery();

    enableSharing();
    setParameterType({ name: "Tag", type: "Editable" });
    publishQuestion();
    visitIframe();
    FieldFilter.openEntryForm();
    FieldFilter.selectFilterValueFromList("1018947080336");
  });
});

const enableSharing = () => {
  cy.icon("share").click();
  cy.findByText("Embed in your application").click();
  cy.wait("@sessionProperties");
};

const setParameterType = ({ name, type }) => {
  cy.findByText("Which parameters can users of this embed use?")
    .parent()
    .findByText(name)
    .parent()
    .findByRole("button")
    .click();

  popover().findByText(type).click();
};

const publishQuestion = () => {
  cy.button("Publish").click();
  cy.wait("@updateQuestion");
};
