const { H } = cy;

describe("scenarios > question > native > suggestions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show suggestions for tables", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("se");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("SEATS")
        .should("be.visible")
        .should("contain.text", "ACCOUNTS :type/Integer");
    });
  });

  it("should show suggestions for syntax keywords", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("se");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("SELECT")
        .should("be.visible")
        .should("contain.text", "keyword");
    });
  });

  it("should suggest locals", () => {
    H.startNewNativeQuestion({
      query:
        "SELECT date_trunc('month', CREATED_AT) as order_month FROM ORDERS GROUP BY ",
    });
    H.NativeEditor.type("order_mo");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("order_month")
        .should("be.visible")
        .should("contain.text", "local");
    });
  });

  it("should suggest quoted locals", () => {
    H.startNewNativeQuestion({
      query: 'SELECT foo as "QUOTED_local" FROM ORDERS GROUP BY ',
    });
    H.NativeEditor.type("QU");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("QUOTED_local")
        .should("be.visible")
        .should("contain.text", "local");
    });
  });

  it("should not show duplicate suggestions", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("acc");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("ACCOUNT_ID")
        .should("be.visible")
        .should("have.length", 1);
    });
  });
});

describe(
  "scenarios > question > native > suggestions",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      H.restore("mongo-5");
      cy.signInAsAdmin();
    });

    it("should suggest keywords", () => {
      H.startNewNativeQuestion({ database: 2, query: "" });

      H.NativeEditor.type('[{ "$grou');
      H.NativeEditor.completions().within(() => {
        H.NativeEditor.completion("$group")
          .should("be.visible")
          .should("have.length", 1)
          .should("contain.text", "keyword");
      });
    });

    it("should suggest tables and fields from the schema", () => {
      H.startNewNativeQuestion({ database: 2, query: "" });

      H.NativeEditor.type('[{ "$group": { "pr');
      H.NativeEditor.completions().within(() => {
        H.NativeEditor.completion("price")
          .should("be.visible")
          .should("contain.text", "products :type/Float");
        H.NativeEditor.completion("product_id")
          .should("be.visible")
          .should("contain.text", "orders :type/Integer");
        H.NativeEditor.completion("products")
          .should("be.visible")
          .should("contain.text", "Table");
      });
    });
  },
);
