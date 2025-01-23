import { H } from "e2e/support";

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
