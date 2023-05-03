import { restore, popover, startNewQuestion } from "e2e/support/helpers";

const PG_DB_NAME = "QA Postgres12";

// Ironically, both Prettier and Cypress remove escape characters from our code as well
// We're testing for the literal sting `(?<=\/\/)[^\/]*`, but we need to escape the escape characters to make it work
const ESCAPED_REGEX = "(?<=\\/\\/)[^\\/]*";

describe.skip(
  "postgres > question > custom columns",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();

      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(PG_DB_NAME).should("be.visible").click();
      cy.findByTextEnsureVisible("People").click();
    });

    it("should not remove regex escape characters (metabase#14517)", () => {
      cy.log("Create custom column using `regexextract()`");
      cy.icon("add_data").click();
      popover().within(() => {
        cy.get("[contenteditable='true']")
          .type(`regexextract([State], "${ESCAPED_REGEX}")`)
          .blur();

        // It removes escaped characters already on blur
        cy.log("Reported failing on v0.36.4");
        cy.contains(ESCAPED_REGEX);
      });
    });
  },
);
