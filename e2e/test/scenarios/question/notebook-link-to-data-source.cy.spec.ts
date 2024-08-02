import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createNativeQuestion,
  createQuestion,
  getNotebookStep,
  openNotebook,
  openReviewsTable,
  popover,
  restore,
  tableInteractive,
  visitModel,
  visitQuestion,
  visualize,
  type NativeQuestionDetails,
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

    it("should open the source question from a nested question where the source is native question", () => {
      const source = {
        name: "Native source",
        native: {
          query: "select 1 as foo",
          "template-tags": {},
        },
      };

      createNativeQuestion(source).then(({ body: sourceQuestion }) => {
        createQuestion(
          {
            name: "Nested question based on a native question",
            query: { "source-table": `card__${sourceQuestion.id}` },
          },
          { visitQuestion: true },
        );

        openNotebook();
        getNotebookStep("data").findByText(source.name).click(clickConfig);

        cy.log("Make sure the source question rendered in a simple mode");
        cy.location("pathname").should(
          "eq",
          `/question/${sourceQuestion.id}-native-source`,
        );

        cy.findAllByTestId("header-cell")
          .should("have.length", "1")
          .and("have.text", "FOO");
        cy.get("#main-data-grid")
          .findByTestId("cell-data")
          .should("have.text", "1");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Question is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
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

    it("should open the source model from a nested question where the source is native model", () => {
      const source: NativeQuestionDetails = {
        name: "Native source",
        native: {
          query: "select 1 as foo",
          "template-tags": {},
        },
        type: "model",
      };

      createNativeQuestion(source).then(({ body: sourceQuestion }) => {
        createQuestion(
          {
            name: "Nested question based on a native question",
            query: { "source-table": `card__${sourceQuestion.id}` },
          },
          { visitQuestion: true },
        );

        openNotebook();
        getNotebookStep("data")
          .findByText(sourceQuestion.name)
          .click(clickConfig);

        cy.log("Make sure the source model rendered in a simple mode");
        cy.location("pathname").should(
          "eq",
          `/model/${sourceQuestion.id}-native-source`,
        );

        cy.findByTestId("scalar-value").should("have.text", "1");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it('should open the "trash" if the source question has been archived', () => {
      createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
        cy.log("Move the source question to the trash");
        cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
          archived: true,
        });

        visitQuestion(nestedQuestion.id);
      });

      openNotebook();
      getNotebookStep("data").findByText("Orders, Count").click(clickConfig);

      cy.log('Make sure the source question opens in the "trash"');
      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_COUNT_QUESTION_ID}-orders-count`,
      );
      cy.findByTestId("archive-banner").should(
        "contain",
        "This question is in the trash",
      );
    });
  });

  context("models", () => {
    it("should open the underlying model", () => {
      visitModel(ORDERS_MODEL_ID);
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

    it("should open the underlying native model", () => {
      const model: NativeQuestionDetails = {
        name: "Native model",
        native: {
          query: "select 1 as foo",
          "template-tags": {},
        },
        type: "model",
      };

      createNativeQuestion(model).then(({ body: { id, name } }) => {
        visitModel(id);

        openNotebook();
        getNotebookStep("data").findByText(name).click(clickConfig);

        cy.log("Make sure the source model rendered in a simple mode");
        cy.location("pathname").should("eq", `/model/${id}-native-model`);

        cy.findByTestId("scalar-value").should("have.text", "1");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it("should open the nested model (based on a question) as the data source", () => {
      createQuestion(
        {
          name: "Nested model based on a question",
          query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
          type: "model",
        },
        { visitQuestion: true, wrapId: true, idAlias: "nestedModelId" },
      );

      openNotebook();
      getNotebookStep("data")
        .findByText("Nested model based on a question")
        .click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.get("@nestedModelId").then(id => {
        cy.location("pathname").should(
          "eq",
          `/model/${id}-nested-model-based-on-a-question`,
        );
        cy.findByTestId("scalar-value").should("have.text", "18,760");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it("should open the nested model (based on a model) as the data source", () => {
      createQuestion(
        {
          name: "Nested model based on a model",
          query: { "source-table": `card__${ORDERS_MODEL_ID}` },
          type: "model",
        },
        { visitQuestion: true, wrapId: true, idAlias: "nestedModelId" },
      );

      openNotebook();
      getNotebookStep("data")
        .findByText("Nested model based on a model")
        .click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.get("@nestedModelId").then(id => {
        cy.location("pathname").should(
          "eq",
          `/model/${id}-nested-model-based-on-a-model`,
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

  context("permissions", () => {
    it("shouldn't show the source question if it lives in a collection that user can't see", () => {
      createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
        cy.log("Move the source question to admin's personal collection");
        cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
          collection_id: ADMIN_PERSONAL_COLLECTION_ID,
        });

        cy.signInAsNormalUser();
        visitQuestion(nestedQuestion.id);

        cy.log("We should not even show the notebook icon");
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        cy.log(
          "Even if user opens the notebook link directly, they should not see the source question. We open the entity picker instead",
        );
        cy.visit(`/question/${nestedQuestion.id}/notebook`);
        cy.findByTestId("entity-picker-modal").within(() => {
          cy.findByText("Pick your starting data").should("be.visible");
          cy.findByLabelText("Close").click();
        });

        getNotebookStep("data").should("contain", "Pick your starting data");

        cy.log(
          "The same should be true for a user that additionally doesn't have write query permissions",
        );
        cy.signIn("nodata");
        visitQuestion(nestedQuestion.id);
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        cy.visit(`/question/${nestedQuestion.id}/notebook`);
        cy.findByTestId("entity-picker-modal").within(() => {
          cy.findByText("Pick your starting data").should("be.visible");
          cy.findByLabelText("Close").click();
        });

        getNotebookStep("data").should("contain", "Pick your starting data");
      });
    });

    it("user with the curate collection permissions but without write query permissions shouldn't be able to see/open the source question", () => {
      createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
        cy.signIn("nodata");
        visitQuestion(nestedQuestion.id);

        cy.log("We should not even show the notebook icon");
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        // TODO update the following once metabase##46398 is fixed
        // cy.visit(`/question/${nestedQuestion.id}/notebook`);
      });
    });
  });
});
