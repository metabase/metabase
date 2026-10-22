const { H } = cy;

describe("scenarios > question > native > suggestions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should suggest tables, keywords and locals without duplicates", () => {
    H.startNewNativeQuestion();

    cy.log("tables and syntax keywords");
    H.NativeEditor.type("se");
    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("SEATS")
        .should("be.visible")
        .should("contain.text", "ACCOUNTS :type/Integer");
      H.NativeEditor.completion("SELECT")
        .should("be.visible")
        .should("contain.text", "keyword");
    });

    cy.log("locals");
    H.NativeEditor.clear();
    H.NativeEditor.type(
      "SELECT date_trunc('month', CREATED_AT) as order_month FROM ORDERS GROUP BY order_mo",
    );
    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("order_month")
        .should("be.visible")
        .should("contain.text", "local");
    });

    cy.log("quoted locals");
    H.NativeEditor.clear();
    H.NativeEditor.type('SELECT foo as "QUOTED_local" FROM ORDERS GROUP BY QU');
    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("QUOTED_local")
        .should("be.visible")
        .should("contain.text", "local");
    });

    cy.log("no duplicate suggestions");
    H.NativeEditor.clear();
    H.NativeEditor.type("acc");
    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completionLabels("ACCOUNT_ID")
        .should("have.length", 1)
        .and("be.visible");
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

    it("should suggest keywords, tables and fields from the schema", () => {
      H.startNewNativeQuestion({ database: 2, query: "" });

      H.NativeEditor.type('[{ "$grou');
      H.NativeEditor.completions().within(() => {
        H.NativeEditor.completionLabels("$group")
          .should("have.length", 1)
          .and("be.visible");
        H.NativeEditor.completion("$group").should("contain.text", "keyword");
      });

      H.NativeEditor.type('p": { "pr', { focus: false });
      H.NativeEditor.value().should("contain", '[{ "$group": { "pr');
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
