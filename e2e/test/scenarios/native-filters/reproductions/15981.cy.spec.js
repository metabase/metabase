import { restore, openNativeEditor } from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 15981", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openNativeEditor();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it(`"Text" filter should work (metabase#15981-1)`, () => {
    SQLFilter.enterParameterizedQuery(
      "select * from PRODUCTS where CATEGORY = {{text_filter}}",
    );

    SQLFilter.setWidgetValue("Gizmo");

    SQLFilter.runQuery();

    cy.get(".Visualization").contains("Rustic Paper Wallet");

    cy.icon("contract").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 51 rows");
    cy.icon("play").should("not.exist");
  });

  it(`"Number" filter should work (metabase#15981-2)`, () => {
    SQLFilter.enterParameterizedQuery(
      "select * from ORDERS where QUANTITY = {{number_filter}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Number");

    SQLFilter.setWidgetValue("20");

    SQLFilter.runQuery();

    cy.get(".Visualization").contains("23.54");
  });
});
