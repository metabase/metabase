import {
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  popover,
  queryBuilderMain,
  restore,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

describe("issue 20683", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should filter postgres with the 'current quarter' filter (metabase#20683)", () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();

    popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative dates…").click();
      cy.findByText("Past").click();
      cy.findByText("Current").click();
      cy.findByText("Quarter").click();
    });

    visualize();

    queryBuilderMain().findByText("No results!").should("be.visible");
  });
});
