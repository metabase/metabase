import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  checkFilterListSourceHasValue,
  describeEE,
  multiAutocompleteInput,
  multiAutocompleteValue,
  openNativeEditor,
  popover,
  restore,
  saveQuestion,
  setConnectedFieldSource,
  setDropdownFilterType,
  setFilterListSource,
  setFilterQuestionSource,
  setSearchBoxFilterType,
  setTokenFeatures,
  visitEmbeddedPage,
  visitPublicQuestion,
  visitQuestion,
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

  describe("static list source (dropdown)", () => {
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
      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });
  });

  describe("static list source with custom labels (dropdown)", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");
      setFilterListSource({
        values: [["1018947080336", "Custom Label"], "7663515285824"],
      });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      checkFilterValueNotInList("1018947080336");
      FieldFilter.selectFilterValueFromList("Custom Label");
      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      checkFilterValueNotInList("1018947080336");
      FieldFilter.selectFilterValueFromList("Custom Label");
      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      checkFilterValueNotInList("1018947080336");
      FieldFilter.selectFilterValueFromList("Custom Label");
      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });
  });

  describe("static list source (search box)", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");

      setSearchBoxFilterType();
      setFilterListSource({
        values: ["1018947080336", "7663515285824"],
      });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("101");
      popover().last().findByText("1018947080336").click();

      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "1018947080336");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("101");
      popover().last().findByText("1018947080336").click();
      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "1018947080336");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("101");
      popover().last().findByText("1018947080336").click();
      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "1018947080336");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });
  });

  describe("static list source with custom labels (search box)", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");

      setSearchBoxFilterType();
      setFilterListSource({
        values: [["1018947080336", "Custom Label"], "7663515285824"],
      });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("Custom Label");
      popover().last().findByText("1018947080336").should("not.exist");
      popover().last().findByText("Custom Label").click();
      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("Custom Label");
      popover().last().findByText("1018947080336").should("not.exist");
      popover().last().findByText("Custom Label").click();
      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("Custom Label");
      popover().last().findByText("1018947080336").should("not.exist");
      popover().last().findByText("Custom Label").click();
      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
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
        attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
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
    checkFilterValueNotInList("Gizmo");
    checkFilterValueNotInList("Doohickey");
    FieldFilter.selectFilterValueFromList("Widget");
  });
});

describe("scenarios > filters > sql filters > values source > number parameter", () => {
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

  describe("static list source (dropdown)", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT {{ x }}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");

      setDropdownFilterType();
      setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("10");
      FieldFilter.selectFilterValueFromList("Twenty");
      cy.findByLabelText("X").should("contain.text", "Twenty");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getNumberTargetQuestion({
          parameter: {
            values_query_type: "list",
            values_source_type: "static-list",
            values_source_config: {
              values: [["10", "Ten"], ["20", "Twenty"], "30"],
            },
          },
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("10");
      FieldFilter.selectFilterValueFromList("Twenty");
      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(
        getNumberTargetQuestion({
          parameter: {
            values_query_type: "list",
            values_source_type: "static-list",
            values_source_config: {
              values: [["10", "Ten"], ["20", "Twenty"], "30"],
            },
          },
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("10");
      FieldFilter.selectFilterValueFromList("Twenty");
      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });
  });

  describe("static list source with custom labels (dropdown)", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT * FROM {{ tag }}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");
      setSearchBoxFilterType();
      setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();
      multiAutocompleteInput().type("Tw");
      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");
      popover().last().findByText("Twenty").click();
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getNumberTargetQuestion({
          parameter: {
            values_query_type: "search",
            values_source_type: "static-list",
            values_source_config: {
              values: [["10", "Ten"], ["20", "Twenty"], "30"],
            },
          },
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      multiAutocompleteInput().type("Tw");
      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");

      popover().last().findByText("Twenty").click();
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });

    it("should be able to use a static list source when public", () => {
      cy.createNativeQuestion(
        getNumberTargetQuestion({
          parameter: {
            values_query_type: "search",
            values_source_type: "static-list",
            values_source_config: {
              values: [["10", "Ten"], ["20", "Twenty"], "30"],
            },
          },
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      multiAutocompleteInput().type("Tw");
      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");

      popover().last().findByText("Twenty").click();
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });
  });

  describe("static list source (search box)", () => {
    it("should be able to use a static list source in the query builder", () => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery("SELECT {{ tag }}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");

      setSearchBoxFilterType();
      setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      saveQuestion("SQL filter");

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("Tw");
      popover().last().findByText("Twenty").click();

      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Twenty");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createNativeQuestion(
        getNumberTargetQuestion({
          parameter: {
            values_query_type: "search",
            values_source_type: "static-list",
            values_source_config: {
              values: [["10", "Ten"], ["20", "Twenty"], "30"],
            },
          },
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();

      multiAutocompleteInput().type("Twenty");
      popover().last().findByText("Twenty").click();
      multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Twenty");
      popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });
  });

  it("should show the values when picking the default value", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT {{ x }}");
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");

    setDropdownFilterType();
    setFilterListSource({
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });

    cy.findByTestId("sidebar-content")
      .findByPlaceholderText("Select a default value…")
      .click();

    popover().findByText("Twenty").click();

    saveQuestion("SQL filter");

    cy.findByLabelText("X").should("contain.text", "Twenty");
    SQLFilter.runQuery("cardQuery");
  });

  it("should clear the value type and config when changing the template tag type and restore them when changing the type back", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Text");
    setSearchBoxFilterType();
    setFilterListSource({
      values: ["Foo", "Bar"],
    });
    saveQuestion("SQL filter");

    SQLFilter.openTypePickerFromSelectedFilterType("Text");
    SQLFilter.chooseType("Number");

    cy.get("[data-checked='true']").should("have.text", "Input box");

    setSearchBoxFilterType();
    checkFilterListSourceHasValue({ values: [] });

    SQLFilter.openTypePickerFromSelectedFilterType("Number");
    SQLFilter.chooseType("Field Filter");
    setConnectedFieldSource("Orders", "Total");

    SQLFilter.openTypePickerFromSelectedFilterType("Number");
    SQLFilter.chooseType("Text");
    cy.get("[data-checked='true']").should("have.text", "Search box");
    checkFilterListSourceHasValue({ values: ["Foo", "Bar"] });
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

const getNumberTargetQuestion = ({ tag, parameter }) => {
  return getTargetQuestion({
    query: "SELECT {{tag}}",
    tag: {
      type: "number",
      ...tag,
    },
    parameter: {
      type: "number/=",
      target: ["variable", ["template-tag", "tag"]],
      ...parameter,
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

const getListDimensionTargetQuestion = ({
  values_query_type = "list",
  values,
}) => {
  return getDimensionTargetQuestion({
    tag: {
      dimension: ["field", PRODUCTS.EAN, null],
    },
    parameter: {
      values_query_type,
      values_source_type: "static-list",
      values_source_config: {
        values,
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
  popover()
    .last()
    .within(() => {
      cy.findByText(value).should("exist");
    });
};

const checkFilterValueNotInList = value => {
  popover()
    .last()
    .within(() => {
      cy.findByText(value).should("not.exist");
    });
};
