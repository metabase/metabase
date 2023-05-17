import { filterWidget, openNativeEditor, restore } from "e2e/support/helpers";
import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "../helpers/e2e-field-filter-helpers";

const SQL_QUERY = "SELECT * FROM PRODUCTS WHERE {{f1}} AND {{f2}}";

describe("issue 29786", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("mysql-8");
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.signInAsAdmin();
  });

  it("should allow using field filters with null schema (metabase#29786)", () => {
    openNativeEditor({ databaseName: "QA MySQL8" });
    SQLFilter.enterParameterizedQuery(SQL_QUERY);

    cy.findAllByText("Text").first().click();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Category" });
    cy.findAllByText("Text").last().click();
    SQLFilter.chooseType("Field Filter");
    FieldFilter.mapTo({ table: "Products", field: "Vendor" });

    filterWidget().first().click();
    FieldFilter.addWidgetStringFilter("Widget");
    filterWidget().last().click();
    FieldFilter.addWidgetStringFilter("Von-Gulgowski");

    SQLFilter.runQuery();
    cy.findByText("1087115303928").should("be.visible");
  });
});
