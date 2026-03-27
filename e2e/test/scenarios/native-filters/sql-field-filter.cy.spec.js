const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > filters > sql filters > field filter", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
  });

  describe("required tag", () => {
    beforeEach(() => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE {{filter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");

      FieldFilter.mapTo({
        table: "Products",
        field: "ID",
      });

      cy.findByTestId("filter-widget-type-select")
        .should("have.value", "ID")
        .should("be.disabled");
    });

    function setDefaultFieldValue(value) {
      cy.findByTestId("sidebar-content")
        .findByText("Enter a default value…")
        .click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a default value…").type(value);
        cy.button("Add filter").click();
      });
    }

    it("does not need a default value to run and save the query", () => {
      SQLFilter.toggleRequired();
      SQLFilter.getRunQueryButton().should("not.be.disabled");
      SQLFilter.getSaveQueryButton().should("not.have.attr", "disabled");
    });

    it("when there's a default value, enabling required sets it as a parameter value", () => {
      setDefaultFieldValue(5);
      H.filterWidget().click();
      H.clearFilterWidget();
      SQLFilter.toggleRequired();
      H.filterWidget().should("contain.text", "5");
    });

    it("when there's a default value and value is unset, updating filter sets the default back", () => {
      setDefaultFieldValue(10);
      SQLFilter.toggleRequired();
      H.filterWidget().click();
      H.popover().within(() => {
        H.removeFieldValuesValue(0);
        cy.findByText("Set to default").click();
      });

      cy.log("make sure the dialog is gone");
      cy.findByRole("dialog").should("not.exist");

      H.filterWidget().should("contain.text", "10");
    });

    it("when there's a default value and template tag is required, can reset it back", () => {
      setDefaultFieldValue(8);
      SQLFilter.toggleRequired();
      H.filterWidget().click();
      H.popover().within(() => {
        H.fieldValuesCombobox().type("10,");
        cy.findByText("Update filter").click();
      });
      H.filterWidget().icon("revert").click();
      H.filterWidget().should("contain.text", "8");
    });
  });

  context("ID filter", () => {
    beforeEach(() => {
      H.startNewNativeQuestion({ display: "table" });
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE {{filter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");

      FieldFilter.mapTo({
        table: "Products",
        field: "ID",
      });

      cy.findByTestId("filter-widget-type-select")
        .should("have.value", "ID")
        .should("be.disabled");
    });

    it("should work when set initially as default value and then through the filter widget", () => {
      cy.log("the default value should apply");
      FieldFilter.addDefaultStringFilter("2", "Add filter");
      SQLFilter.runQuery();
      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Small Marble Shoes");
      });

      cy.log("the default value should not apply when the value is cleared");
      H.clearFilterWidget();
      SQLFilter.runQuery();
      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Small Marble Shoes");
        cy.findByText("Rustic Paper Wallet");
      });
    });
  });

  // Deprecated field filter types
  context("Category", () => {
    const questionDetails = {
      name: "Products SQL",
      native: {
        query: "select * from products where {{category}}",
        "template-tags": {
          category: {
            "display-name": "Field Filter",
            id: "abc123",
            name: "category",
            type: "dimension",
            // This is the old syntax that should automatically work in newer versions!
            // It should convert to a new syntax ("widget-type": "string/=") when we run the query.
            "widget-type": "category",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            default: ["Doohickey"],
          },
        },
      },
      display: "table",
    };

    it("should work despite it not showing up in the widget type list", () => {
      H.createNativeQuestion(questionDetails, { visitQuestion: true });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 42 rows");

      H.clearFilterWidget();
      H.filterWidget().click();

      H.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Update filter").click();
      });

      cy.findByTestId("qb-header").find(".Icon-play").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 51 rows");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Open Editor").click();
      cy.icon("variable").click();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter widget type")
        .parent()
        .findByTestId("filter-widget-type-select")
        .click();

      H.popover().contains("String");
    });
  });

  describe("field alias", () => {
    it("should be able to use a field alias with a field filter", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "select * from (select id as alias from products) as p where {{filter}}",
      );
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({
        table: "Products",
        field: "ID",
      });
      SQLFilter.setFieldAlias("p.alias");
      H.filterWidget().click();
      H.popover().within(() => {
        H.multiAutocompleteInput().type("10,20");
        cy.button("Add filter").click();
      });
      SQLFilter.runQuery();
      H.tableInteractive().should("contain", "10").and("contain", "20");
    });

    it("should be able to use a field alias with a time grouping", () => {
      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "select count(*), {{date}} as date from products as p group by date",
      );
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Time grouping");
      FieldFilter.mapTo({
        table: "Products",
        field: "Created At",
      });
      SQLFilter.setFieldAlias("p.created_at");
      H.filterWidget().click();
      H.popover().findByText("Month").click();
      SQLFilter.runQuery();
      H.tableInteractive().should("contain", "April 1, 2022");
    });
  });

  describe("missing field", () => {
    it("should show error message when the field mapping is missing", () => {
      cy.log("Set up field filter");

      H.startNewNativeQuestion();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE {{my_filter}}",
        { allowFastSet: true },
      );

      cy.log("Test field filter");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");

      SQLFilter.getSaveQueryButton().should("have.attr", "aria-disabled");
      SQLFilter.getSaveQueryButton().click({ force: true });
      H.tooltip()
        .findByText('The variable "my_filter" needs to be mapped to a field.')
        .should("be.visible");

      SQLFilter.getRunQueryButton().should("be.disabled");
      SQLFilter.getRunQueryButton().click({ force: true });
      H.tooltip()
        .findByText('The variable "my_filter" needs to be mapped to a field.')
        .should("be.visible");

      cy.log("Test time grouping");
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Time grouping");

      SQLFilter.getSaveQueryButton().should("have.attr", "aria-disabled");
      SQLFilter.getSaveQueryButton().click({ force: true });
      H.tooltip()
        .findByText('The variable "my_filter" needs to be mapped to a field.')
        .should("be.visible");

      SQLFilter.getRunQueryButton().should("be.disabled");
      SQLFilter.getRunQueryButton().click({ force: true });
      H.tooltip()
        .findByText('The variable "my_filter" needs to be mapped to a field.')
        .should("be.visible");
    });
  });
});
