import {
  restore,
  openNativeEditor,
  filterWidget,
  popover,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > filters > sql filters > field filter", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
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

      FieldFilter.setWidgetType("ID");
    });

    it("should work when set initially as default value and then through the filter widget", () => {
      SQLFilter.toggleRequired();

      FieldFilter.openEntryForm({ isFilterRequired: true });
      FieldFilter.addDefaultStringFilter("2");

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Small Marble Shoes");
      });

      FieldFilter.openEntryForm();
      FieldFilter.addWidgetStringFilter("1");

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("None").should("be.visible");

      filterWidget().should("not.exist");
    });

    it("should be runnable with the None filter being ignored (metabase#20643)", () => {
      cy.get(".RunButton").first().click();

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

      cy.get(".Visualization").within(() => {
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

      clearFilterValue();
      filterWidget().click();

      popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Add filter").click();
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
        .findAllByTestId("select-button")
        .contains("String");
    });
  });
});

function clearFilterValue() {
  filterWidget().find(".Icon-close").click();
}
