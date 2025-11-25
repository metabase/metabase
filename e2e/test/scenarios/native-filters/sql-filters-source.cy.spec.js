const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
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
      H.createQuestion(structuredSourceQuestion);

      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Category" });
      H.setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("cardQuery");

      SQLFilter.toggleRequired();
      FieldFilter.openEntryForm(true);
      FieldFilter.selectFilterValueFromList("Gadget", {
        buttonLabel: "Update filter",
      });
    });

    it("should be able to use a structured question source with a text tag", () => {
      H.createQuestion(structuredSourceQuestion);

      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      H.setDropdownFilterType();
      H.setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gadget", { addFilter: false });
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("cardQuery");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 51 rows").should("exist");

      SQLFilter.toggleRequired();
      cy.findByTestId("sidebar-content")
        .findByText("Enter a default value…")
        .click();

      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Update filter").click();
      });
    });

    it("should be able to use a structured question source without saving the question", () => {
      H.createQuestion(structuredSourceQuestion);

      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );
      H.setDropdownFilterType();
      H.setFilterQuestionSource({ question: "MBQL source", field: "Category" });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("dataset");
    });

    it("should properly cache parameter values api calls", () => {
      H.createQuestion(structuredSourceQuestion);
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
      );

      H.setDropdownFilterType();
      H.setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      FieldFilter.openEntryForm();
      cy.wait("@parameterValues");
      checkFilterValueInList("Gizmo");
      FieldFilter.closeEntryForm();
      FieldFilter.openEntryForm();
      checkFilterValueInList("Gizmo");
      cy.get("@parameterValues.all").should("have.length", 1);
      H.setFilterListSource({ values: ["A", "B"] });
      FieldFilter.openEntryForm();
      cy.wait("@parameterValues");
      checkFilterValueInList("A");

      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });
      FieldFilter.openEntryForm();
      cy.wait("@cardParameterValues");
      checkFilterValueInList("A");
      FieldFilter.closeEntryForm();
      FieldFilter.openEntryForm();
      checkFilterValueInList("A");
      cy.get("@cardParameterValues.all").should("have.length", 1);
      H.setFilterQuestionSource({ question: "MBQL source", field: "Category" });
      updateQuestion();
      FieldFilter.openEntryForm();
      cy.wait("@cardParameterValues");
      checkFilterValueInList("Gizmo");
    });

    it("should be able to use a structured question source when embedded", () => {
      H.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getStructuredDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
    });

    it("should be able to use a structured question source when embedded with a text tag", () => {
      H.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getStructuredTextTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
    });

    it("should be able to use a structured question source when public", () => {
      H.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getStructuredDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
    });

    it("should be able to use a structured question source when public with a text tag", () => {
      H.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getStructuredTextTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitPublicQuestion(targetQuestionId);
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
      H.createNativeQuestion(nativeSourceQuestion);

      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");
      H.setFilterQuestionSource({ question: "SQL source", field: "EAN" });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a native question source when embedded", () => {
      H.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getNativeDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when embedded with a text tag", () => {
      H.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getNativeTextTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when public", () => {
      H.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getNativeDimensionTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitPublicQuestion(targetQuestionId);
          });
        },
      );

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
    });

    it("should be able to use a native question source when public with a text tag", () => {
      H.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: sourceQuestionId } }) => {
          H.createNativeQuestion(
            getNativeTextTargetQuestion(sourceQuestionId),
          ).then(({ body: { id: targetQuestionId } }) => {
            H.visitPublicQuestion(targetQuestionId);
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
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");
      H.setFilterListSource({ values: ["1018947080336", "7663515285824"] });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });
  });

  describe("static list source with custom labels (dropdown)", () => {
    it("should be able to use a static list source in the query builder", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");
      H.setFilterListSource({
        values: [["1018947080336", "Custom Label"], "7663515285824"],
      });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      checkFilterValueNotInList("1018947080336");
      FieldFilter.selectFilterValueFromList("Custom Label");
      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("0001664425970");
      checkFilterValueNotInList("1018947080336");
      FieldFilter.selectFilterValueFromList("Custom Label");
      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });

    it("should be able to use a static list source when public", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitPublicQuestion(targetQuestionId);
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
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");

      H.setSearchBoxFilterType();
      H.setFilterListSource({
        values: ["1018947080336", "7663515285824"],
      });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();

      H.fieldValuesCombobox().type("101");
      H.popover().findByText("1018947080336").click();

      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "1018947080336");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();

      H.fieldValuesCombobox().type("101");
      H.popover().findByText("1018947080336").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "1018947080336");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });

    it("should be able to use a static list source when public", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: ["1018947080336", "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();

      H.fieldValuesCombobox().type("101");
      H.popover().findByText("1018947080336").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "1018947080336");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "1018947080336");
    });
  });

  describe("static list source with custom labels (search box)", () => {
    it("should be able to use a static list source in the query builder", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({ table: "Products", field: "Ean" });
      FieldFilter.setWidgetType("String");

      H.setSearchBoxFilterType();
      H.setFilterListSource({
        values: [["1018947080336", "Custom Label"], "7663515285824"],
      });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();

      H.fieldValuesCombobox().type("Custom Label");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("1018947080336").should("not.exist");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Custom Label").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();

      H.fieldValuesCombobox().type("Custom Label");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("1018947080336").should("not.exist");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Custom Label").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });

    it("should be able to use a static list source when public", () => {
      H.createNativeQuestion(
        getListDimensionTargetQuestion({
          values_query_type: "search",
          values: [["1018947080336", "Custom Label"], "7663515285824"],
        }),
      ).then(({ body: { id: targetQuestionId } }) => {
        H.visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();

      H.fieldValuesCombobox().type("Custom Label");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("1018947080336").should("not.exist");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Custom Label").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
    });
  });
});

describe("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
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

    H.createQuestion(structuredSourceQuestion).then(
      ({ body: { id: sourceQuestionId } }) => {
        H.createNativeQuestion(
          getStructuredDimensionTargetQuestion(sourceQuestionId),
        ).then(({ body: { id: targetQuestionId } }) => {
          cy.signOut();
          cy.signInAsSandboxedUser();
          H.visitQuestion(targetQuestionId);
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
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
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
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT {{ x }}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");

      H.setDropdownFilterType();
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("10");
      FieldFilter.selectFilterValueFromList("Twenty");
      cy.findByLabelText("X").should("contain.text", "Twenty");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
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
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("10");
      FieldFilter.selectFilterValueFromList("Twenty");
      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });

    it("should be able to use a static list source when public", () => {
      H.createNativeQuestion(
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
        H.visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      checkFilterValueNotInList("10");
      FieldFilter.selectFilterValueFromList("Twenty");
      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });
  });

  describe("static list source with custom labels (dropdown)", () => {
    it("should be able to use a static list source in the query builder", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT * FROM {{ tag }}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");
      H.setSearchBoxFilterType();
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();
      H.dashboardParametersPopover().within(() => {
        H.multiAutocompleteInput().type("Tw");
      });

      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Twenty").click();
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
      SQLFilter.runQuery("cardQuery");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
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
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();
      H.multiAutocompleteInput().type("Tw");
      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Twenty").click();
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });

    it("should be able to use a static list source when public", () => {
      H.createNativeQuestion(
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
        H.visitPublicQuestion(targetQuestionId);
      });

      FieldFilter.openEntryForm();
      H.multiAutocompleteInput().type("Tw");
      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Twenty").click();
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });
  });

  describe("static list source (search box)", () => {
    it("should be able to use a static list source in the query builder", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT {{ tag }}");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");

      H.setSearchBoxFilterType();
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      H.saveQuestion("SQL filter", undefined, {
        path: ["Our analytics"],
      });

      FieldFilter.openEntryForm();

      H.dashboardParametersPopover().within(() => {
        H.multiAutocompleteInput().type("Tw");
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Twenty").click();

      H.multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Twenty");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createNativeQuestion(
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
        H.visitEmbeddedPage(getQuestionResource(targetQuestionId));
      });

      FieldFilter.openEntryForm();

      H.multiAutocompleteInput().type("Tw");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Twenty").click();
      H.multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Twenty");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
    });
  });

  it("should show the values when picking the default value", () => {
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery("SELECT {{ x }}");
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");

    H.setDropdownFilterType();
    H.setFilterListSource({
      values: [["10", "Ten"], ["20", "Twenty"], "30"],
    });

    cy.findByTestId("sidebar-content")
      .findByText("Enter a default value…")
      .click();

    H.popover().within(() => {
      cy.findByText("Twenty").click();
      cy.button("Add filter").click();
    });

    H.saveQuestion("SQL filter", undefined, {
      path: ["Our analytics"],
    });

    cy.findByLabelText("X").should("contain.text", "Twenty");
    SQLFilter.runQuery("cardQuery");
  });

  it("should clear the value type and config when changing the template tag type and restore them when changing the type back", () => {
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery("SELECT * FROM PRODUCTS WHERE {{tag}}");
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Text");
    H.setSearchBoxFilterType();
    H.setFilterListSource({
      values: ["Foo", "Bar"],
    });
    H.saveQuestion("SQL filter", undefined, {
      path: ["Our analytics"],
    });

    SQLFilter.openTypePickerFromSelectedFilterType("Text");
    SQLFilter.chooseType("Number");

    cy.findByLabelText("Input box").should("be.checked");

    H.setSearchBoxFilterType();
    H.checkFilterListSourceHasValue({ values: [] });

    SQLFilter.openTypePickerFromSelectedFilterType("Number");
    SQLFilter.chooseType("Field Filter");
    H.setConnectedFieldSource("Orders", "Total");

    SQLFilter.openTypePickerFromSelectedFilterType("Number");
    SQLFilter.chooseType("Text");
    cy.findByLabelText("Search box").should("be.checked");
    H.checkFilterListSourceHasValue({ values: ["Foo", "Bar"] });
  });
});

const getQuestionResource = (questionId) => ({
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

const getStructuredTextTargetQuestion = (questionId) => {
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

const getNativeTextTargetQuestion = (questionId) => {
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

const getStructuredDimensionTargetQuestion = (questionId) => {
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

const getNativeDimensionTargetQuestion = (questionId) => {
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
  cy.findByTestId("save-question-modal").within((modal) => {
    cy.findByText("Save").click();
  });
  cy.wait("@updateQuestion");
};

const checkFilterValueInList = (value) => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover()
    .last()
    .within(() => {
      cy.findByText(value).should("exist");
    });
};

const checkFilterValueNotInList = (value) => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover()
    .last()
    .within(() => {
      cy.findByText(value).should("not.exist");
    });
};
