import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  getNotebookStep,
  openNotebook,
  openReviewsTable,
  popover,
  restore,
  tableInteractive,
  visitQuestion,
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

  context("questions", () => {
    it("should open the source table from a simple question", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openNotebook();
      getNotebookStep("data").findByText("Orders").click(clickConfig);

      cy.log("Make sure Orders table is rendered in a simple mode");
      cy.findAllByTestId("header-cell").should("contain", "Subtotal");
      tableInteractive().should("contain", "37.65");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing first 2,000 rows",
      );

      cy.findByTestId("qb-save-button").should("be.enabled");
    });

    it("should open the source question from a nested question", () => {
      createQuestion(
        {
          name: "Nested question based on a question",
          query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
        },
        { visitQuestion: true },
      );

      openNotebook();
      getNotebookStep("data").findByText("Orders, Count").click(clickConfig);

      cy.log("Make sure the source question rendered in a simple mode");
      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_COUNT_QUESTION_ID}-orders-count`,
      );
      cy.findAllByTestId("header-cell")
        .should("have.length", "1")
        .and("have.text", "Count");
      tableInteractive().should("contain", "18,760");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing 1 row",
      );

      // Question is not dirty
      cy.findByTestId("qb-save-button").should("not.exist");
    });

    it("should open the source model from a nested question", () => {
      createQuestion(
        {
          name: "Nested question based on a model",
          query: { "source-table": `card__${ORDERS_MODEL_ID}` },
        },
        { visitQuestion: true },
      );

      openNotebook();
      getNotebookStep("data").findByText("Orders Model").click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.location("pathname").should(
        "eq",
        `/model/${ORDERS_MODEL_ID}-orders-model`,
      );
      cy.findAllByTestId("header-cell").should("contain", "Subtotal");
      tableInteractive().should("contain", "37.65");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing first 2,000 rows",
      );

      // Model is not dirty
      cy.findByTestId("qb-save-button").should("not.exist");
    });
  });
});
