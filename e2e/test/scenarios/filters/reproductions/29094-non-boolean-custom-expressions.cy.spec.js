import {
  enterCustomColumnDetails,
  getNotebookStep,
  popover,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";

describe("issue 29094", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("disallows adding a filter using non-boolean custom expression (metabase#29094)", () => {
    startNewQuestion();

    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });

    getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();

    popover().within(() => {
      cy.findByText("Custom Expression").click();
      enterCustomColumnDetails({ formula: "[Tax] * 22" });
      cy.realPress("Tab");
      cy.button("Done").should("be.disabled");
      cy.findByText("Invalid expression").should("exist");
    });
  });
});
