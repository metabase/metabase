import { restore, openNativeEditor, runNativeQuery } from "e2e/support/helpers";

describe("issue 16584", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    openNativeEditor()
      .type("SELECT * FROM ACCOUNTS WHERE COUNTRY = {{ country }}", {
        parseSpecialCharSequences: false,
        delay: 0,
      })
      .type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

    runNativeQuery();

    cy.wait("@dataset").then(({ request }) => {
      const { body } = request;
      expect(body.parameters[0].value).to.equal("NL");
    });
  });
});
