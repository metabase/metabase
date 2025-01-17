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
