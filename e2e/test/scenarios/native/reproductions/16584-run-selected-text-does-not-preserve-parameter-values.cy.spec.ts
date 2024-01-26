import { restore, openNativeEditor, runNativeQuery } from "e2e/support/helpers";

describe("issue 16584", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    openNativeEditor()
      .type("SELECT * FROM ACCOUNTS WHERE COUNTRY = {{ country }} ", {
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
