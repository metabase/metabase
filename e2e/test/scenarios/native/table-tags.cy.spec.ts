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
});
