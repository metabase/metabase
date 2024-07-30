import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  openNativeEditor,
  clearFilterWidget,
  filterWidget,
  popover,
  removeMultiAutocompleteValue,
  multiAutocompleteInput,
} from "e2e/support/helpers";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > filters > sql filters > field filter", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
  });

  describe("required tag", () => {
    beforeEach(() => {
      openNativeEditor();
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
      popover().within(() => {
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
      filterWidget().click();
      clearFilterWidget();
      SQLFilter.toggleRequired();
      filterWidget().findByTestId("field-set-content").should("have.text", "5");
    });

    it("when there's a default value and value is unset, updating filter sets the default back", () => {
      setDefaultFieldValue(10);
      SQLFilter.toggleRequired();
      filterWidget().click();
      popover().within(() => {
        removeMultiAutocompleteValue(0);
        cy.findByText("Set to default").click();
      });
      filterWidget()
        .findByTestId("field-set-content")
        .should("have.text", "10");
    });

    it("when there's a default value and template tag is required, can reset it back", () => {
      setDefaultFieldValue(8);
      SQLFilter.toggleRequired();
      filterWidget().click();
      popover().within(() => {
        multiAutocompleteInput().type("10,");
        cy.findByText("Update filter").click();
      });
      filterWidget().icon("revert").click();
      filterWidget().findByTestId("field-set-content").should("have.text", "8");
    });
  });

  context("ID filter", () => {
    beforeEach(() => {
      openNativeEditor();
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
      FieldFilter.addDefaultStringFilter("2");
      SQLFilter.runQuery();
      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Small Marble Shoes");
      });

      cy.log("the default value should not apply when the value is cleared");
      clearFilterWidget();
      SQLFilter.runQuery();
      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Small Marble Shoes");
        cy.findByText("Rustic Paper Wallet");
      });
    });
  });

  context("None", () => {
    beforeEach(() => {
      openNativeEditor();
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM people WHERE {{filter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");

      FieldFilter.mapTo({
        table: "People",
        field: "Longitude",
      });

      cy.findByTestId("filter-widget-type-select")
        .should("have.value", "None")
        .should("be.disabled");

      filterWidget().should("not.exist");
    });

    it("should be runnable with the None filter being ignored (metabase#20643)", () => {
      cy.findAllByTestId("run-button").first().click();

      cy.wait("@dataset");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Hudson Borer");
    });

    it("should let you change the field filter type to something else and restore the filter widget (metabase#13825)", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Longitude").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Address").click();

      FieldFilter.setWidgetType("String contains");

      FieldFilter.openEntryForm();
      FieldFilter.addWidgetStringFilter("111 L");

      SQLFilter.runQuery();

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("111 Leupp Road");
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
      cy.createNativeQuestion(questionDetails, { visitQuestion: true });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 42 rows");

      clearFilterWidget();
      filterWidget().click();

      popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Update filter").click();
      });

      cy.findByTestId("qb-header").find(".Icon-play").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 51 rows");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Open Editor").click();
      cy.icon("variable").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter widget type")
        .parent()
        .findByTestId("filter-widget-type-select")
        .click();

      popover().contains("String");
    });
  });
});
