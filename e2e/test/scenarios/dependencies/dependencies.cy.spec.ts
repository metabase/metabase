const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

H.describeWithSnowplowEE("documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetSnowplow();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("questions", () => {
    it("should not show a confirmation if there are no breaking changes when updating a question", () => {
      createQuestionContent();
      H.visitQuestion("@questionId");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").click();
      H.CustomExpressionEditor.clear().type("2 + 2");
      H.popover().button("Update").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      cy.wait("@updateCard");
    });

    it("should be able to confirm or cancel breaking changes to a question", () => {
      createQuestionContent();
      H.visitQuestion("@questionId");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();

      cy.log("cancel breaking changes");
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.button("Cancel").click();
      });
      cy.get("@updateCard.all").should("have.length", 0);

      cy.log("confirm breaking changes");
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().button("Save anyway").click();
      cy.wait("@updateCard");
    });

    it("should be able to navigate to affected questions or their collection", () => {
      createQuestionContent();

      cy.log("check that we can navigate to a broken question");
      H.visitQuestion("@questionId");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().findByText("Question with fields").click();
      confirmDiscardChanges();
      H.queryBuilderHeader()
        .findByDisplayValue("Question with fields")
        .should("be.visible");

      cy.log("check that we can navigate to the collection of that question");
      cy.go("back");
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Our analytics").click();
      });
      confirmDiscardChanges();
      H.collectionTable().should("be.visible");
    });
  });

  describe("models", () => {
    it("should not show a confirmation if there are no breaking changes when updating a model", () => {
      createModelContent();
      cy.get<number>("@modelId").then(H.visitModel);
      H.openQuestionActions("Edit query definition");
      H.NativeEditor.clear().type("SELECT ID, CATEGORY FROM PRODUCTS");
      H.runNativeQuery();
      H.datasetEditBar().button("Save changes").click();
      cy.wait("@updateCard");
    });

    it("should be able to confirm or cancel breaking changes to a model", () => {
      createModelContent();
      cy.get<number>("@modelId").then(H.visitModel);
      H.openQuestionActions("Edit query definition");
      H.NativeEditor.clear().type("SELECT ID, TITLE FROM PRODUCTS");
      H.runNativeQuery();

      cy.log("cancel breaking changes");
      H.datasetEditBar().button("Save changes").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.button("Cancel").click();
      });
      cy.get("@updateCard.all").should("have.length", 0);

      cy.log("confirm breaking changes");
      H.datasetEditBar().button("Save changes").click();
      H.modal().button("Save anyway").click();
      cy.wait("@updateCard");
    });
  });
});

function createQuestionContent() {
  H.createQuestion({
    name: "Base question",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Expr: ["+", 1, 1],
      },
    },
  }).then(({ body: card }) => {
    cy.wrap(card.id).as("questionId");

    H.createQuestion({
      name: "Question with fields",
      query: {
        "source-table": `card__${card.id}`,
        filter: [">", ["field", "Expr", { "base-type": "type/Integer" }], 1],
      },
    });
    H.createQuestion({
      name: "Question without fields",
      query: {
        "source-table": `card__${card.id}`,
      },
    });
  });
}

function createModelContent() {
  H.createNativeQuestion({
    name: "Base model",
    type: "model",
    native: {
      query: "SELECT ID, TITLE, CATEGORY FROM PRODUCTS",
      "template-tags": {},
    },
  }).then(({ body: card }) => {
    cy.wrap(card.id).as("modelId");
    cy.request("POST", `/api/card/${card.id}/query`);

    const tagName = `#${card.id}`;
    H.createNativeQuestion({
      name: "Question with fields",
      native: {
        query: `SELECT ID, CATEGORY FROM {{#${card.id}}}`,
        "template-tags": {
          [tagName]: {
            id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
            name: tagName,
            "display-name": tagName,
            type: "card",
            "card-id": card.id,
          },
        },
      },
    });
    H.createNativeQuestion({
      name: "Question without fields",
      native: {
        query: `SELECT COUNT(*) FROM {{#${card.id}}}`,
        "template-tags": {
          [tagName]: {
            id: "10422a0f-292d-10a3-fd90-407cc9e3e20f",
            name: tagName,
            "display-name": tagName,
            type: "card",
            "card-id": card.id,
          },
        },
      },
    });
  });
}

function confirmDiscardChanges() {
  H.modal().should("have.length", 2).last().button("Discard changes").click();
}
