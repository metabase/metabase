import {
  addCustomColumn,
  enterCustomColumnDetails,
  getNotebookStep,
  popover,
  visualize,
  restore,
  startNewQuestion,
  queryBuilderMain,
} from "e2e/support/helpers";

const CC_NAME = "C-States";
const PG_DB_NAME = "QA Postgres12";

describe("issue 13751", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    startNewQuestion();
    popover().findByText("Raw Data").click();
    popover().findByText(PG_DB_NAME).should("be.visible").click();
    popover().findByTextEnsureVisible("People").click();
  });

  it("should allow using strings in filter based on a custom column (metabase#13751)", () => {
    addCustomColumn();
    popover().within(() => {
      enterCustomColumnDetails({
        formula: 'regexextract([State], "^C[A-Z]")',
      });
      cy.findByPlaceholderText("Something nice and descriptive").type(CC_NAME);
      cy.button("Done").click();
    });

    getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();
    popover().within(() => {
      cy.findByText(CC_NAME).click();
      cy.findByDisplayValue("Is").click();
      cy.findByPlaceholderText("Enter some text").type("CO");
      cy.button("Add filter").click();
    });

    visualize();

    queryBuilderMain().findByText("Arnold Adams").should("be.visible");
  });
});
