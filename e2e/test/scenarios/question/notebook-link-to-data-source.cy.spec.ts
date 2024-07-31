import {
  getNotebookStep,
  openNotebook,
  openReviewsTable,
  popover,
  restore,
  tableInteractive,
  visualize,
} from "e2e/support/helpers";

// https://docs.cypress.io/api/cypress-api/platform
const macOSX = Cypress.platform === "darwin";

const clickConfig = {
  metaKey: macOSX,
  ctrlKey: !macOSX,
};

describe("scenarios > notebook > link to data source", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.on("window:before:load", win => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").callsFake(url => {
        expect(win.open).to.be.calledOnce;
        // replace the current page with the linked data source upon ctrl/meta click
        win.location.replace(url);
      });
    });
  });

  it("smoke test", () => {
    openReviewsTable({ mode: "notebook" });

    cy.log("Normal click on the data source still opens the entity picker");
    getNotebookStep("data").findByText("Reviews").click();
    cy.findByTestId("entity-picker-modal").within(() => {
      cy.findByText("Pick your starting data").should("be.visible");
      cy.findByLabelText("Close").click();
    });

    cy.log("Meta/Ctrl click on the fields picker behaves as a regular click");
    getNotebookStep("data").findByTestId("fields-picker").click(clickConfig);
    popover().within(() => {
      cy.findByText("Select none").click();
    });
    // Regular click on the fields picker again to close the popover
    getNotebookStep("data").findByTestId("fields-picker").click();
    // Mid-test sanity-check assertion
    visualize();
    cy.findAllByTestId("header-cell")
      .should("have.length", 1)
      .and("have.text", "ID");

    cy.log(
      "Deselecting columns should have no effect on the linked data source in new tab/window",
    );
    openNotebook();
    getNotebookStep("data").findByText("Reviews").click(clickConfig);
    cy.wait("@dataset"); // already intercepted in `visualize()`

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
