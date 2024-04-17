import {
  addCustomColumn,
  enterCustomColumnDetails,
  getNotebookStep,
  popover,
  visualize,
  restore,
  startNewQuestion,
  queryBuilderMain,
  selectFilterOperator,
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
    enterCustomColumnDetails({
      formula: 'regexextract([State], "^C[A-Z]")',
      name: CC_NAME,
    });
    cy.button("Done").click();

    getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();
    popover().findByText(CC_NAME).click();
    selectFilterOperator("Is");
    popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("CO");
      cy.button("Add filter").click();
    });

    visualize();

    queryBuilderMain().findByText("Arnold Adams").should("be.visible");
  });
});
