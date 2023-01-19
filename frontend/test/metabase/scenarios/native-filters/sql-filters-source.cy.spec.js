import {
  openNativeEditor,
  restore,
  setFilterQuestionSource,
  saveQuestion,
  setFilterListSource,
  visitEmbeddedPage,
  visitPublicQuestion,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  describe("structured question source", () => {
    it("should be able to use a structured question source", () => {
      cy.createQuestion(getStructuredSourceQuestion());

      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Category" });
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      saveQuestion("SQL filter");
      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("Gadget");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a structured question source when embedded", () => {
      cy.createQuestion(getStructuredSourceQuestion()).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("Gadget");
    });

    it("should be able to use a structured question source when public", () => {
      cy.createQuestion(getStructuredSourceQuestion()).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("Gadget");
    });
  });

  describe("native question source", () => {
    it("should be able to use a native question source in the query builder", () => {
      cy.createNativeQuestion(getNativeSourceQuestion());

      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      setFilterQuestionSource({ question: "SQL source", field: "EAN" });
      saveQuestion("SQL filter");
      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a native question source when embedded", () => {
      cy.createNativeQuestion(getNativeSourceQuestion()).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getNativeTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when public", () => {
      cy.createNativeQuestion(getNativeSourceQuestion()).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getNativeTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("1018947080336");
    });
  });

  describe("static list source", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      setFilterListSource({ values: ["1018947080336", "7663515285824"] });
      saveQuestion("SQL filter");
      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(getListTargetQuestion()).then(
        ({ body: { targetQuestionId } }) => {
          visitEmbeddedPage(getQuestionResource(targetQuestionId));
        },
      );

      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(getListTargetQuestion()).then(
        ({ body: { id: targetQuestionId } }) => {
          visitPublicQuestion(targetQuestionId);
        },
      );

      FieldFilter.openEntryForm();
      FieldFilter.selectFilterValueFromList("1018947080336");
    });
  });
});

const getQuestionResource = sourceQuestionId => ({
  resource: { question: sourceQuestionId },
  params: {},
});

const getStructuredSourceQuestion = () => ({
  name: "MBQL source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
  },
});

const getNativeSourceQuestion = () => ({
  name: "SQL source",
  native: {
    query: "SELECT '1018947080336' EAN UNION ALL SELECT '7663515285824'",
  },
});

const getTargetQuestion = tag => ({
  name: "Embedded",
  native: {
    query: "SELECT * FROM PRODUCTS WHERE {{tag}}",
    "template-tags": {
      tag: {
        id: "93961154-c3d5-7c93-7b59-f4e494fda499",
        name: "tag",
        "display-name": "Tag",
        type: "dimension",
        dimension: ["field", PRODUCTS.EAN, null],
        "widget-type": "string/=",
        ...tag,
      },
    },
  },
  enable_embedding: true,
  embedding_params: {
    tag: "enabled",
  },
});

const getStructuredTargetQuestion = questionId => {
  return getTargetQuestion({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", PRODUCTS.CATEGORY, null],
    },
  });
};

const getNativeTargetQuestion = questionId => {
  return getTargetQuestion({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", "EAN", null],
    },
  });
};

const getListTargetQuestion = () => {
  return getTargetQuestion({
    values_source_type: "static-list",
    values_source_config: {
      values: ["1018947080336", "7663515285824"],
    },
  });
};
