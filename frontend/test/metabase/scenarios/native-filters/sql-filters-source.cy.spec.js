import {
  openNativeEditor,
  restore,
  setFilterQuestionSource,
  saveQuestion,
  setFilterListSource,
  visitEmbeddedPage,
  visitPublicQuestion,
  popover,
  modal,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import { toggleRequired } from "./helpers/e2e-sql-filter-helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const structuredSourceQuestion = {
  name: "MBQL source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
  },
};

const nativeSourceQuestion = {
  name: "SQL source",
  native: {
    query: "SELECT '1018947080336' EAN UNION ALL SELECT '7663515285824'",
  },
};

describe("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dataset/parameter/values").as("parameterValues");
    cy.intercept("GET", "/api/card/*/params/*/values").as(
      "cardParameterValues",
    );
  });

  describe("structured question source", () => {
    it("should be able to use a structured question source", () => {
      cy.createQuestion(structuredSourceQuestion);

      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Category" });
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Gizmo");
      FieldFilter.selectFilterValueFromList("Gadget");
      SQLFilter.runQuery("cardQuery");

      toggleRequired();
      FieldFilter.openEntryForm(true);
      FieldFilter.selectFilterValueFromList("Gadget");
    });

    it("should be able to use a structured question source with a text tag", () => {
      cy.createQuestion(structuredSourceQuestion);

      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Gizmo");
      FieldFilter.selectFilterValueFromList("Gadget");
      SQLFilter.runQuery("cardQuery");

      toggleRequired();
      FieldFilter.openEntryForm(true);
      FieldFilter.selectFilterValueFromList("Gadget");
    });

    it("should be able to use a structured question source without saving the question", () => {
      cy.createQuestion(structuredSourceQuestion);

      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Gizmo");
      FieldFilter.setWidgetStringFilter("Gadget");
      checkFilterValueNotInList("Widget");
      FieldFilter.selectFilterValueFromList("Gadget");
      SQLFilter.runQuery("dataset");
    });

    it("should properly cache parameter values api calls", () => {
      cy.createQuestion(structuredSourceQuestion);
      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );

      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      FieldFilter.openEntryForm();
      cy.wait("@parameterValues");
      checkFilterValueInList("Gadget");
      FieldFilter.closeEntryForm();
      FieldFilter.openEntryForm();
      checkFilterValueInList("Gadget");
      cy.get("@parameterValues.all").should("have.length", 1);
      setFilterListSource({ values: ["A", "B"] });
      FieldFilter.openEntryForm();
      cy.wait("@parameterValues");
      checkFilterValueInList("A");

      saveQuestion("SQL filter");
      FieldFilter.openEntryForm();
      cy.wait("@cardParameterValues");
      checkFilterValueInList("A");
      FieldFilter.closeEntryForm();
      FieldFilter.openEntryForm();
      checkFilterValueInList("A");
      cy.get("@cardParameterValues.all").should("have.length", 1);
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      updateQuestion();
      FieldFilter.openEntryForm();
      cy.wait("@cardParameterValues");
      checkFilterValueInList("Gadget");
    });

    it("should be able to use a structured question source when embedded", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Gizmo");
      FieldFilter.selectFilterValueFromList("Gadget");
    });

    it("should be able to use a structured question source when public", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Gizmo");
      FieldFilter.selectFilterValueFromList("Gadget");
    });
  });

  describe("native question source", () => {
    it("should be able to use a native question source in the query builder", () => {
      cy.createNativeQuestion(nativeSourceQuestion);

      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      setFilterQuestionSource({ question: "SQL source", field: "EAN" });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a native question source when embedded", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getNativeTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when public", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getNativeTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
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
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(getListTargetQuestion()).then(
        ({ body: { id: targetQuestionId } }) => {
          visitEmbeddedPage(getQuestionResource(targetQuestionId));
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(getListTargetQuestion()).then(
        ({ body: { id: targetQuestionId } }) => {
          visitPublicQuestion(targetQuestionId);
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });
  });
});

const getQuestionResource = questionId => ({
  resource: { question: questionId },
  params: {},
});

const getTargetQuestion = ({ tag, parameter }) => ({
  name: "Embedded",
  native: {
    query: "SELECT * FROM PRODUCTS WHERE {{tag}}",
    "template-tags": {
      tag: {
        id: "93961154-c3d5-7c93-7b59-f4e494fda499",
        name: "tag",
        "display-name": "Tag",
        type: "dimension",
        "widget-type": "string/=",
        ...tag,
      },
    },
  },
  parameters: [
    {
      id: "93961154-c3d5-7c93-7b59-f4e494fda499",
      name: "Tag",
      slug: "tag",
      type: "string/=",
      target: ["dimension", ["template-tag", "tag"]],
      ...parameter,
    },
  ],
  enable_embedding: true,
  embedding_params: {
    tag: "enabled",
  },
});

const getStructuredTargetQuestion = questionId => {
  return getTargetQuestion({
    tag: {
      dimension: ["field", PRODUCTS.CATEGORY, null],
    },
    parameter: {
      values_source_type: "card",
      values_source_config: {
        card_id: questionId,
        value_field: ["field", PRODUCTS.CATEGORY, null],
      },
    },
  });
};

const getNativeTargetQuestion = questionId => {
  return getTargetQuestion({
    tag: {
      dimension: ["field", PRODUCTS.EAN, null],
    },
    parameter: {
      values_source_type: "card",
      values_source_config: {
        card_id: questionId,
        value_field: ["field", "EAN", { "base-type": "type/Text" }],
      },
    },
  });
};

const getListTargetQuestion = () => {
  return getTargetQuestion({
    tag: {
      dimension: ["field", PRODUCTS.EAN, null],
    },
    parameter: {
      values_source_type: "static-list",
      values_source_config: {
        values: ["1018947080336", "7663515285824"],
      },
    },
  });
};

const updateQuestion = () => {
  cy.findByText("Save").click();
  modal().button("Save").click();
  cy.wait("@updateQuestion");
};

const checkFilterValueInList = value => {
  popover().within(() => {
    cy.findByText(value).should("exist");
  });
};

const checkFilterValueNotInList = value => {
  popover().within(() => {
    cy.findByText(value).should("not.exist");
  });
};
