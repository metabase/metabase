const { H } = cy;

describe("scenarios > native > table tags", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should run the query with a mapped table", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from {{table}}");
    cy.findByTestId("variable-type-select").click();
    H.popover().findByText("Table").click();
    H.popover().findByText("Products").click();
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(200);
  });

  it("should run the query with a table alias before the table is synced", () => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_data_types" });
    H.startNewNativeQuestion();
    H.NativeEditor.selectDataSource("Writable Postgres12");
    H.NativeEditor.type("select * from {{table}}");
    cy.findByTestId("variable-type-select").click();
    H.popover().findByText("Table").click();
    cy.get("body").click();
    cy.findByTestId("table-alias-input").type("public.many_data_types");
    cy.get("body").click();
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(2);
  });
});
