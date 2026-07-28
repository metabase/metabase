const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

import * as FieldFilter from "./helpers/e2e-field-filter-helpers";
import * as SQLFilter from "./helpers/e2e-sql-filter-helpers";

describe(
  "scenarios > filters > sql filters > field filter > Boolean",
  { tags: "@external" },
  () => {
    const dialect = "postgres";
    const tableName = "many_data_types";

    function assertScalarValue(value) {
      cy.findByTestId("scalar-value").findByText(value).should("be.visible");
    }

    beforeEach(() => {
      H.restore(`${dialect}-writable`);
      H.resetTestTable({ type: dialect, table: tableName });
      cy.signInAsAdmin();
      H.resyncDatabase({ tableName });
    });

    it("should be able to use boolean field filters", () => {
      cy.log("setup a boolean field filter");
      H.startNewNativeQuestion({ database: WRITABLE_DB_ID });
      SQLFilter.enterParameterizedQuery(
        `SELECT count(*) FROM ${tableName} WHERE {{f}}`,
      );
      SQLFilter.openTypePickerFromDefaultFilterType();
      SQLFilter.chooseType("Field Filter");
      FieldFilter.mapTo({
        table: "Many Data Types",
        field: "Boolean",
      });
      H.saveQuestion("SQL", undefined, {
        path: ["Our analytics"],
      });

      cy.log("field filter with true");
      H.runNativeQuery({ wait: false });
      assertScalarValue("2");
      H.filterWidget().click();
      H.popover().button("Add filter").click();
      H.runNativeQuery({ wait: false });
      assertScalarValue("1");
      H.filterWidget().icon("close").click();
      H.runNativeQuery({ wait: false });
      assertScalarValue("2");

      cy.log("field filter with false");
      H.filterWidget().click();
      H.popover().within(() => {
        cy.findByText("False").click();
        cy.button("Add filter").click();
      });
      H.runNativeQuery({ wait: false });
      assertScalarValue("1");
      H.filterWidget().icon("close").click();
      H.runNativeQuery({ wait: false });
      assertScalarValue("2");
    });
  },
);

describe("scenarios > filters > sql filters > variable > Boolean", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to define boolean variables in the query", () => {
    cy.log("new query");
    H.startNewNativeQuestion();
    SQLFilter.enterParameterizedQuery(
      "select id from products [[where category = (case when {{boolean}} then 'Gadget' else 'Widget' end)]]",
    );
    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Boolean");

    cy.log("assert that it works for an ad-hoc query");
    H.filterWidget().click();
    H.popover().button("Add filter").click();
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(53);

    cy.log("assert that it works for a saved query");
    H.saveQuestion("SQL");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByLabelText("False").click();
      cy.button("Update filter").click();
    });
    H.runNativeQuery({ wait: false });
    H.assertQueryBuilderRowCount(54);
  });
});
