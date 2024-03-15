import {
  ORDERS_MODEL_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitModel,
  openNotebook,
  openQuestionActions,
  popover,
  visitQuestion,
} from "e2e/support/helpers";

describe("issue 39812", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", () => {
    visitModel(ORDERS_MODEL_ID);
    openNotebook();

    openDataSelector();
    assertSourceCollection("Our analytics");
    assertDataSource("Orders Model");

    moveToCollection("First collection");

    openDataSelector();
    assertSourceCollection("First collection");
    assertDataSource("Orders Model");
  });

  it("moving the source question should immediately reflect in the data selector for the nested question that depends on it (metabase#39812-2)", () => {
    const SOURCE_QUESTION_ID = ORDERS_COUNT_QUESTION_ID;
    // Rename the source question to make assertions more explicit
    const sourceQuestionName = "Source Question";
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      name: sourceQuestionName,
    });

    const nestedQuestionDetails = {
      name: "Nested Question",
      query: { "source-table": `card__${SOURCE_QUESTION_ID}` },
    };

    cy.createQuestion(nestedQuestionDetails, {
      wrapId: true,
      idAlias: "nestedQuestionId",
    });

    visitQuestion("@nestedQuestionId");
    openNotebook();

    openDataSelector();
    assertSourceCollection("Our analytics");
    assertDataSource(sourceQuestionName);

    cy.log("Move the source question to another collection");
    visitQuestion(SOURCE_QUESTION_ID);
    openNotebook();
    moveToCollection("First collection");

    cy.log("Make sure the source change is reflected in a nested question");
    visitQuestion("@nestedQuestionId");
    openNotebook();

    openDataSelector();
    assertSourceCollection("First collection");
    assertDataSource(sourceQuestionName);
  });
});

function moveToCollection(collection: string) {
  openQuestionActions();
  popover().findByTextEnsureVisible("Move").click();
  cy.findByRole("dialog").within(() => {
    cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");
    cy.findAllByTestId("item-picker-item")
      .filter(`:contains(${collection})`)
      .click();

    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}

function openDataSelector() {
  cy.findByTestId("data-step-cell").click();
}

function assertItemSelected(item: string) {
  cy.findByLabelText(item).should("have.attr", "aria-selected", "true");
}

function assertSourceCollection(collection: string) {
  return assertItemSelected(collection);
}

function assertDataSource(questionOrModel: string) {
  return assertItemSelected(questionOrModel);
}
