import {
  filterWidget,
  openNativeEditor,
  restore,
  queryBuilderMain,
  popover,
} from "e2e/support/helpers";

import * as FieldFilter from "../helpers/e2e-field-filter-helpers";
import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

const SQL_QUERY = "SELECT * FROM PRODUCTS WHERE CATEGORY = {{test}}";

describe("issue 31606", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should clear values on UI for Text, Number, Date and Field Filter Types (metabase#31606)", () => {
    openNativeEditor();

    SQLFilter.enterParameterizedQuery(SQL_QUERY);

    // Text
    SQLFilter.setWidgetValue("Gizmo");
    SQLFilter.runQuery();

    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    filterWidget().findByRole("textbox").clear();

    SQLFilter.runQuery();
    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("be.visible");

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");
    SQLFilter.setWidgetValue("123");

    SQLFilter.runQuery();

    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    filterWidget().findByRole("textbox").clear();
    SQLFilter.runQuery();
    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("be.visible");

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });

    // Field Filter - Default value
    SQLFilter.openTypePickerFromSelectedFilterType("Number");
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "ID",
    });

    cy.findByTestId("filter-widget-type-select")
      .should("have.value", "ID")
      .should("be.disabled");

    FieldFilter.addDefaultStringFilter("2");

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Enter a default value…").should("not.exist");
      cy.findByText("Default filter widget value")
        .next()
        .find("a")
        .first()
        .click();
    });

    popover().within(() => {
      cy.icon("close").click();
      cy.findByText("Update filter").click();
    });
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("Enter a default value…").should("be.visible");
    });

    // Field Filter
    filterWidget().click();
    popover().findByPlaceholderText("Enter an ID").type("23");
    popover().findByText("Add filter").click();

    filterWidget().within(() => {
      cy.icon("close").should("be.visible");
    });

    SQLFilter.runQuery();
    queryBuilderMain()
      .findByText(/missing required parameters/)
      .should("not.exist");

    filterWidget().click();

    popover().within(() => {
      cy.icon("close").click();
      cy.findByText("Update filter").click();
    });

    filterWidget().within(() => {
      cy.icon("close").should("not.exist");
    });
  });
});
