import { restore, openNativeEditor } from "__support__/e2e/helpers";

describe("issue 15029", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow dots in the variable reference (metabase#15029)", () => {
    openNativeEditor().type(
      "select * from products where RATING = {{number.of.stars}}",
      {
        parseSpecialCharSequences: false,
      },
    );

    cy.findAllByText("Variable name").parent().findByText("number.of.stars");
  });
});
