import { restore, openNativeEditor, popover } from "__support__/e2e/cypress";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "../helpers/e2e-field-filter-helpers";

describe("issue 15444", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should run with the default field filter set (metabase#15444)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery(
      "select * from products where {{category}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Category",
    });

    SQLFilter.toggleRequired();

    FieldFilter.openEntryForm({ isFilterRequired: true });
    // We could've used `FieldFilter.addDefaultStringFilter("Doohickey")` but that's been covered already in the filter test matrix.
    // This flow tests the ability to pick the filter from a dropdown when there are not too many results (easy to choose from).
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    SQLFilter.runQuery();

    cy.get(".Visualization").within(() => {
      cy.findAllByText("Doohickey");
      cy.findAllByText("Gizmo").should("not.exist");
    });
  });
});
