import { restore, describeWithToken } from "__support__/e2e/cypress";

const TOOLS_ERRORS_URL = "/admin/tools/errors";

describeWithToken("admin > tools > erroring questions ", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("without broken questions", () => {
    it('should render the "Tools" tab and navigate to the "Erroring Questions" by clicking on it', () => {
      cy.visit("/admin");

      cy.get("nav")
        .contains("Tools")
        .click();

      cy.location("pathname").should("eq", TOOLS_ERRORS_URL);

      cy.findByText("No results");

      cy.findByRole("link", { name: "Erroring Questions" })
        .should("have.attr", "href")
        .and("eq", TOOLS_ERRORS_URL);
    });

    it.skip("should disable search input fields (metabase#18050)", () => {
      cy.visit(TOOLS_ERRORS_URL);

      // When the issue gets fixed, it's safe to merge these assertions with the main test above
      cy.findByPlaceholderText("Error name").should("be.disabled");
      cy.findByPlaceholderText("DB name").should("be.disabled");
      cy.findByPlaceholderText("Collection name").should("be.disabled");
    });
  });
});
