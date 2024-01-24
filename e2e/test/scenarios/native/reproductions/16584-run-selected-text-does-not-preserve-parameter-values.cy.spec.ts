import { restore, openNativeEditor } from "e2e/support/helpers";

describe("issue 16584", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("run");
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", async () => {
    const editor = openNativeEditor();

    editor.type("SELECT * FROM ACCOUNTS WHERE COUNTRY = {{ country ");
    editor.type("{selectAll}");

    cy.get("input[placeholder='Country']").type("NL");

    cy.get("button[aria-label='Get Answer']").first().click();
    cy.wait("@run").then(({ request }) => {
      const { body } = request;
      expect(body.parameters[0].value).to.equal("NL");
    });
  });
});
