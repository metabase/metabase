import {
  restore,
  openNativeEditor,
  filterWidget,
} from "__support__/e2e/cypress";

import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "./helpers/e2e-field-filter-helpers";

describe("scenarios > filters > sql filters > field filter > None", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    openNativeEditor();
    SQLFilter.enterParameterizedQuery("SELECT * FROM people WHERE {{filter}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "People",
      field: "Longitude",
    });

    cy.findByText("None").should("be.visible");

    filterWidget().should("not.exist");
  });

  it("should disallow the running of the query and the saving of the question", () => {
    cy.get(".RunButton").should("be.disabled");
    cy.findByText("Save").should("have.class", "disabled");
  });

  it("should let you change the field filter type to something else and restore the filter widget (metabase#13825)", () => {
    cy.findByText("Longitude").click();
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
