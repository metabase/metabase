import {
  enterCustomColumnDetails,
  popover,
  visualize,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";

const CC_NAME = "C-States";
const PG_DB_NAME = "QA Postgres12";

describe("issue 13751", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(PG_DB_NAME).should("be.visible").click();
    cy.findByTextEnsureVisible("People").click();
  });

  it("should allow using strings in filter based on a custom column (metabase#13751)", () => {
    cy.log("Create custom column using `regexextract()`");

    cy.icon("add_data").click();
    popover().within(() => {
      enterCustomColumnDetails({
        formula: 'regexextract([State], "^C[A-Z]")',
      });
      cy.findByPlaceholderText("Something nice and descriptive").type(CC_NAME);
      cy.get(".Button").contains("Done").should("not.be.disabled").click();
    });

    // Add filter based on custom column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filters to narrow your answer").click();
    popover().within(() => {
      cy.findByText(CC_NAME).click();
      cy.findByTestId("select-button").click();
      cy.log(
        "**It fails here already because it doesn't find any condition for strings. Only numbers.**",
      );
      cy.findByText("Is");
      cy.get("input").type("CO");
      cy.get(".Button")
        .contains("Add filter")
        .should("not.be.disabled")
        .click();
    });

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Arnold Adams");
  });
});
