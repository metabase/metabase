import {
  getNotebookStep,
  openReviewsTable,
  restore,
  tableInteractive,
} from "e2e/support/helpers";

describe("scenarios > notebook > link to data source", () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();
  });

  it("should open the raw table as the data source", () => {
    cy.on("window:before:load", win => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").callsFake(url => {
        expect(win.open).to.be.calledOnce;
        // replace the current page with the linked data source upon ctrl/meta click
        win.location.replace(url);
      });
    });

    openReviewsTable({ mode: "notebook" });
    cy.intercept("POST", "/api/dataset").as("dataset");
    getNotebookStep("data").findByText("Reviews").click({ metaKey: true });
    cy.wait("@dataset");

    cy.log("Make sure Reviews table is rendered in a simple mode");
    cy.findAllByTestId("header-cell").should("contain", "Reviewer");
    tableInteractive().should("contain", "xavier");
    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 1,112 rows",
    );

    cy.findByTestId("qb-save-button").should("be.enabled");
  });
});
