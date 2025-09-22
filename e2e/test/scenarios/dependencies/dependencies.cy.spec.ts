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
      createQuestionContent().then(({ baseCard }) => {
        H.visitQuestion(baseCard.id);
      });
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").click();
      H.CustomExpressionEditor.clear().type("2 + 2");
      H.popover().button("Update").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      cy.wait("@updateCard");
    });

    it("should be able to confirm or cancel breaking changes to a question", () => {
      createQuestionContent().then(({ baseCard }) => {
        H.visitQuestion(baseCard.id);
      });

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
      createQuestionContent().then(({ baseCard }) => {
        cy.log("check that we can navigate to a broken question");
        H.visitQuestion(baseCard.id);
        H.openNotebook();
        H.getNotebookStep("expression")
          .findByText("Expr")
          .icon("close")
          .click();
        H.queryBuilderHeader().button("Save").click();
        H.modal().button("Save").click();
        H.modal().findByText("Question with fields").click();
        confirmDiscardChanges();
        H.queryBuilderHeader()
          .findByDisplayValue("Question with fields")
          .should("be.visible");

        cy.log("check that we can navigate to the collection of that question");
        cy.go("back");
        H.getNotebookStep("expression")
          .findByText("Expr")
          .icon("close")
          .click();
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
  });
});

function createQuestionContent() {
  return H.createQuestion({
    name: "Base question",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Expr: ["+", 1, 1],
      },
    },
  }).then(({ body: baseCard }) => {
    return H.createQuestion({
      name: "Question with fields",
      query: {
        "source-table": `card__${baseCard.id}`,
        filter: [">", ["field", "Expr", { "base-type": "type/Integer" }], 1],
      },
    }).then(() => {
      return H.createQuestion({
        name: "Question without fields",
        query: {
          "source-table": `card__${baseCard.id}`,
        },
      }).then(() => {
        return { baseCard };
      });
    });
  });
}

function confirmDiscardChanges() {
  H.modal().should("have.length", 2).last().button("Discard changes").click();
}
