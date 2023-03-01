import { openNativeEditor, restore } from "e2e/support/helpers";

import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";

describe("issue 17490", () => {
  beforeEach(() => {
    mockDatabaseTables();

    restore();
    cy.signInAsAdmin();
  });

  it.skip("nav bar shouldn't cut off the popover with the tables for field filter selection (metabase#17490)", () => {
    openNativeEditor();
    SQLFilter.enterParameterizedQuery("{{f}}");

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    /**
     * Although `.click()` isn't neccessary for Cypress to fill out this input field,
     * it's something that we can use to assert that the input field is covered by another element.
     * Cypress fails to click any element that is not "actionable" (for example - when it's covered).
     * In other words, the `.click()` part is essential for this repro to work. Don't remove it.
     */
    cy.findByPlaceholderText("Find...").click().type("Orders").blur();

    cy.findByDisplayValue("Orders");
  });
});

function mockDatabaseTables() {
  cy.intercept("GET", "/api/database?include=tables", req => {
    req.reply(res => {
      const mockTables = new Array(7).fill({
        id: 42, // id is hard coded, but it doesn't matter for this repro
        db_id: 1,
        name: "Z",
        display_name: "ZZZ",
        schema: "PUBLIC",
      });

      res.body.data = res.body.data.map(d => ({
        ...d,
        tables: [...d.tables, ...mockTables],
      }));
    });
  });
}
