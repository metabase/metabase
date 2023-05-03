import {
  restore,
  openNativeEditor,
  popover,
  filterWidget,
} from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 27257", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT {{number}}");

    filterWidget().within(() => {
      cy.icon("string");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Variable type").parent().findByText("Text").click();
    popover().contains("Number").click();

    filterWidget().within(() => {
      cy.icon("number");
      cy.findByPlaceholderText("Number").type("0").blur();
      cy.findByDisplayValue("0");
    });

    SQLFilter.runQuery();

    cy.get(".ScalarValue").invoke("text").should("eq", "0");
  });

  it("should not drop numeric filter widget value on refresh even if it's zero (metabase#27257)", () => {
    cy.reload();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Here's where your results will appear");
    cy.findByDisplayValue("0");
  });
});
