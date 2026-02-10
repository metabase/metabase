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

  it("should run the query with a table tag inside a snippet", () => {
    H.startNewNativeQuestion();

    cy.log("create a snippet containing a table tag");
    cy.findByTestId("native-query-top-bar").icon("snippet").click();
    cy.findByTestId("sidebar-right").findByText("Create snippet").click();
    H.modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "select * from {{table}}",
        { parseSpecialCharSequences: false },
      );
      cy.findByLabelText("Give your snippet a name").type("TableSnippet");
      cy.button("Save").click();
    });

    cy.log("map the table variable to the Products table");
    cy.findByTestId("variable-type-select").click();
    H.popover().findByText("Table").click();
    H.popover().findByText("Products").click();

    cy.log("run the query and verify results");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(200);
  });
});
