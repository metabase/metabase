const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;
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
    cy.intercept("POST", "/api/dataset").as("dataset");
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
      checkFilterValueInList("Gizmo");
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("cardQuery");
      H.assertQueryBuilderRowCount(51);

      SQLFilter.toggleRequired();
      FieldFilter.openEntryForm(true);
      FieldFilter.selectFilterValueFromList("Gadget", {
        buttonLabel: "Update filter",
      });
      cy.findByTestId("sidebar-content").should("contain", "Gadget");
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
      checkFilterValueInList("Gizmo");
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
      cy.findByTestId("sidebar-content").should("contain", "Gadget");
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
      checkFilterValueNotInList("Doohickey");
      FieldFilter.selectFilterValueFromList("Gizmo");
      SQLFilter.runQuery("dataset");
      H.assertQueryBuilderRowCount(51);
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
      checkFilterValueInList("1018947080336");
      checkFilterValueNotInList("0001664425970");
      FieldFilter.selectFilterValueFromList("1018947080336");
      SQLFilter.runQuery("cardQuery");
      H.assertQueryBuilderRowCount(1);
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
      checkFilterValueInList("Custom Label");
      checkFilterValueNotInList("0001664425970");
      checkFilterValueNotInList("1018947080336");
      FieldFilter.selectFilterValueFromList("Custom Label");
      cy.findByLabelText("Tag").should("contain.text", "Custom Label");
      SQLFilter.runQuery("cardQuery");
      H.assertQueryBuilderRowCount(1);

      FieldFilter.openEntryForm();
      H.popover().findByText("Custom Label").click();
      FieldFilter.selectFilterValueFromList("7663515285824", {
        buttonLabel: "Update filter",
      });
      cy.findByLabelText("Tag").should("contain.text", "7663515285824");
      SQLFilter.runQuery("cardQuery");
      H.assertQueryBuilderRowCount(1);
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
      H.popover().last().findByText("Custom Label").should("be.visible");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("1018947080336").should("not.exist");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Custom Label").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "Custom Label");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Custom Label");

      FieldFilter.openEntryForm();
      H.removeFieldValuesValue(0);
      H.fieldValuesCombobox().type("766");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("7663515285824").click();
      H.fieldValuesValue(0)
        .should("be.visible")
        .should("contain", "7663515285824");
      H.popover().button("Update filter").click();

      cy.findByLabelText("Tag").should("contain.text", "7663515285824");
    });
  });
});
describe("scenarios > filters > sql filters > values source > number parameter", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  describe("static list source with custom labels (search box)", () => {
    it("should be able to use a static list source in the query builder", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery("SELECT {{ tag }} AS V");
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
      H.popover().last().findByText("Twenty").should("be.visible");
      checkFilterValueNotInList("10");
      checkFilterValueNotInList("20");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Twenty").click();
      H.multiAutocompleteValue(0)
        .should("be.visible")
        .should("contain", "Twenty");
      H.popover().button("Add filter").click();

      cy.findByLabelText("Tag").should("contain.text", "Twenty");
      SQLFilter.runQuery("cardQuery");
      H.assertQueryBuilderRowCount(1);
      H.queryBuilderMain().findByText("20").should("be.visible");
    });
  });

  it("should show the values when picking the default value and use a static list source in the query builder", () => {
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery("SELECT {{ x }} AS V");
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
    H.assertQueryBuilderRowCount(1);
    H.queryBuilderMain().findByText("20").should("be.visible");

    cy.log("static list source (dropdown)");
    H.clearFilterWidget();
    cy.findByLabelText("X").should("not.contain.text", "Twenty");

    FieldFilter.openEntryForm();
    checkFilterValueInList("Ten");
    checkFilterValueNotInList("10");
    FieldFilter.selectFilterValueFromList("Ten", {
      buttonLabel: "Update filter",
    });
    cy.findByLabelText("X").should("contain.text", "Ten");
    SQLFilter.runQuery("cardQuery");
    H.assertQueryBuilderRowCount(1);
    H.queryBuilderMain().findByText("10").should("be.visible");
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

const updateQuestion = () => {
  cy.findByText("Save").click();
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByText("Save").click();
  });
  cy.wait("@updateQuestion");
};

const checkFilterValueInList = (value) => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover()
    .last()
    .within(() => {
      cy.findByText(value).should("be.visible");
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
