import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  describeEE,
  openNativeEditor,
  popover,
  restore,
  saveQuestion,
  setDropdownFilterType,
  setFilterListSource,
  setFilterQuestionSource,
  visitEmbeddedPage,
  visitPublicQuestion,
  visitQuestion,
  setTokenFeatures,
} from "e2e/support/helpers";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;
const { COLLECTION_GROUP } = USER_GROUPS;

const structuredSourceQuestion = {
  name: "MBQL source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
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
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("cardQuery");

      SQLFilter.toggleRequired();
      FieldFilter.openEntryForm(true);
      FieldFilter.selectFilterValueFromList("Gadget", {
        buttonLabel: "Add filter",
      });
    });

    it("should be able to use a structured question source with a text tag", () => {
      cy.createQuestion(structuredSourceQuestion);

      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      setDropdownFilterType();
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gadget", { addFilter: false });
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("cardQuery");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 51 rows").should("exist");

      SQLFilter.toggleRequired();
      cy.findByTestId("sidebar-content")
        .findByPlaceholderText("Start typing to filter…")
        .click();
      popover().findByText("Gadget").click();
    });

    it("should be able to use a structured question source without saving the question", () => {
      cy.createQuestion(structuredSourceQuestion);

      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      setDropdownFilterType();
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("dataset");
    });

    it("should properly cache parameter values api calls", () => {
      cy.createQuestion(structuredSourceQuestion);
      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );

      setDropdownFilterType();
      setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      FieldFilter.openEntryForm();
      cy.wait("@parameterValues");
      checkFilterValueInList("Gizmo");
      FieldFilter.closeEntryForm();
      FieldFilter.openEntryForm();
      checkFilterValueInList("Gizmo");
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
      checkFilterValueInList("Gizmo");
    });

    it("should be able to use a structured question source when embedded", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
    });

    it("should be able to use a structured question source when embedded with a text tag", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredTextTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
    });

    it("should be able to use a structured question source when public", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
    });

    it("should be able to use a structured question source when public with a text tag", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getStructuredTextTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
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
      FieldFilter.setWidgetType("String");
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
            getNativeDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when embedded with a text tag", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getNativeTextTargetQuestion(sourceQuestionId),
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
            getNativeDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when public with a text tag", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          cy.createNativeQuestion(
            getNativeTextTargetQuestion(sourceQuestionId),
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
      FieldFilter.setWidgetType("String");
      setFilterListSource({ values: ["1018947080336", "7663515285824"] });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(getListDimensionTargetQuestion()).then(
        ({ body: { id: targetQuestionId } }) => {
          visitEmbeddedPage(getQuestionResource(targetQuestionId));
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(getListDimensionTargetQuestion()).then(
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

describeEE("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    restore("default-ee");
    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.intercept("POST", "/api/dataset/parameter/values").as("parameterValues");
    cy.intercept("GET", "/api/card/*/params/*/values").as(
      "cardParameterValues",
    );
  });

  it("should sandbox parameter values in questions", () => {
    cy.updatePermissionsGraph({
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });

    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", PRODUCTS.ID, null]],
      },
    });

    cy.createQuestion(structuredSourceQuestion).then(
      ({ body: { id: sourceQuestionId } }) => {
        cy.createNativeQuestion(
          getStructuredDimensionTargetQuestion(sourceQuestionId),
        ).then(({ body: { id: targetQuestionId } }) => {
          cy.signOut();
          cy.signInAsSandboxedUser();
          visitQuestion(targetQuestionId);
        });
      },
    );

    FieldFilter.openEntryForm();
    cy.wait("@cardParameterValues");
    checkFilterValueNotInList("Gadget");
    checkFilterValueNotInList("Doohickey");
    FieldFilter.selectFilterValueFromList("Gizmo");
  });
});

const getQuestionResource = questionId => ({
  resource: { question: questionId },
  params: {},
});

const getTargetQuestion = ({ query, tag, parameter }) => ({
  name: "Embedded",
  native: {
    query,
    "template-tags": {
      tag: {
        id: "93961154-c3d5-7c93-7b59-f4e494fda499",
        name: "tag",
        "display-name": "Tag",
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
      ...parameter,
    },
  ],
  enable_embedding: true,
  embedding_params: {
    tag: "enabled",
  },
});

const getTextTargetQuestion = ({ query, tag, parameter }) => {
  return getTargetQuestion({
    query,
    tag: {
      type: "text",
      ...tag,
    },
    parameter: {
      target: ["variable", ["template-tag", "tag"]],
      values_query_type: "list",
      ...parameter,
    },
  });
};

const getStructuredTextTargetQuestion = questionId => {
  return getTextTargetQuestion({
    query: "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
    parameter: {
      values_source_type: "card",
      values_source_config: {
        card_id: questionId,
        value_field: ["field", PRODUCTS.CATEGORY, null],
      },
    },
  });
};

const getNativeTextTargetQuestion = questionId => {
  return getTextTargetQuestion({
    query: "SELECT * FROM PRODUCTS WHERE EAN = {{tag}}",
    parameter: {
      values_source_type: "card",
      values_source_config: {
        card_id: questionId,
        value_field: ["field", "EAN", { "base-type": "type/Text" }],
      },
    },
  });
};

const getDimensionTargetQuestion = ({ tag, parameter }) => {
  return getTargetQuestion({
    query: "SELECT * FROM PRODUCTS WHERE {{tag}}",
    tag: {
      type: "dimension",
      "widget-type": "string/=",
      dimension: ["field", PRODUCTS.CATEGORY, null],
      ...tag,
    },
    parameter: {
      target: ["dimension", ["template-tag", "tag"]],
      ...parameter,
    },
  });
};

const getStructuredDimensionTargetQuestion = questionId => {
  return getDimensionTargetQuestion({
    tag: {
      dimension: ["field", PRODUCTS.CATEGORY, null],
    },
    parameter: {
      target: ["dimension", ["template-tag", "tag"]],
      values_source_type: "card",
      values_source_config: {
        card_id: questionId,
        value_field: ["field", PRODUCTS.CATEGORY, null],
      },
    },
  });
};

const getNativeDimensionTargetQuestion = questionId => {
  return getDimensionTargetQuestion({
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

const getListDimensionTargetQuestion = () => {
  return getDimensionTargetQuestion({
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
  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
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
