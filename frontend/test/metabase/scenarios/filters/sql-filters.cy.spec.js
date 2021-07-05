import {
  restore,
  mockSessionProperty,
  openNativeEditor,
  filterWidget,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

describe("scenarios > filters > sql filters > basic filter types", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
    // Make sure feature flag is on regardles of the environment where this is running.
    mockSessionProperty("field-filter-operators-enabled?", true);

    openNativeEditor();
  });

  describe("should work for text", () => {
    beforeEach(() => {
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE products.category = {{textFilter}}",
      );
    });

    it("when set through the filter widget", () => {
      SQLFilter.setWidgetValue("Gizmo");

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Rustic Paper Wallet");
        cy.findAllByText("Doohickey").should("not.exist");
      });
    });

    it("when set as the default value for a required filter", () => {
      SQLFilter.toggleRequired();
      SQLFilter.setDefaultValue("Gizmo");

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Rustic Paper Wallet");
        cy.findAllByText("Doohickey").should("not.exist");
      });
    });
  });

  describe("should work for number", () => {
    beforeEach(() => {
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE products.rating = {{numberFilter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Number");
    });

    it("when set through the filter widget", () => {
      SQLFilter.setWidgetValue("4.3");

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Aerodynamic Linen Coat");
        cy.findAllByText("4.3");
      });
    });

    it("when set as the default value for a required filter (metabase#16811)", () => {
      SQLFilter.toggleRequired();
      SQLFilter.setDefaultValue("4.3");

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Aerodynamic Linen Coat");
        cy.findAllByText("4.3");
      });
    });
  });

  describe("should work for date", () => {
    beforeEach(() => {
      SQLFilter.enterParameterizedQuery(
        "SELECT * FROM products WHERE products.created_at = {{dateFilter}}",
      );

      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Date");
    });

    it("when set through the filter widget", () => {
      filterWidget().click();
      // Since we have fixed dates in Sample Dataset (dating back a couple of years), it'd be cumbersome to click back month by month.
      // Instead, let's choose the 15th of the current month and assert that there are no products / no results.
      cy.findByText("15").click();

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("No results!");
      });
    });

    it("when set as the default value for a required filter", () => {
      SQLFilter.toggleRequired();

      cy.findByText("Select a default value…").click();
      cy.findByText("15").click();

      SQLFilter.runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("No results!");
      });
    });
  });
});
