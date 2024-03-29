import {
  restore,
  createNativeQuestion,
  createQuestion,
  openQuestionActions,
  popover,
} from "e2e/support/helpers";

const modelA = {
  name: "Model A",
  native: { query: "select 1 as a1, 2 as a2" },
  type: "model",
};

const modelB = {
  name: "Model B",
  native: { query: "select 1 as b1, 2 as b2" },
  type: "model",
};

describe("issue 40252", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("shouldn't crash during save of metadata (metabase#40252)", () => {
    createNativeQuestion(modelA, { wrapId: true, idAlias: "modelA" });
    createNativeQuestion(modelB, { wrapId: true, idAlias: "modelB" });

    cy.get("@modelA").then(modelAId => {
      cy.get("@modelB").then(modelBId => {
        const questionDetails = {
          name: "40252",
          type: "model",
          query: {
            joins: [
              {
                fields: "all",
                alias: "Model B - A1",
                strategy: "inner-join",
                condition: [
                  "=",
                  [
                    "field",
                    "A1",
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  [
                    "field",
                    "B1",
                    {
                      "base-type": "type/Integer",
                      "join-alias": "Model B - A1",
                    },
                  ],
                ],
                "source-table": `card__${modelBId}`,
              },
            ],
            "source-table": `card__${modelAId}`,
          },
        };

        createQuestion(questionDetails, { visitQuestion: true });
      });
    });

    openQuestionActions();

    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1").click();
    cy.findByLabelText("Display name").type("Upd");

    cy.findByTestId("dataset-edit-bar")
      .findByRole("button", { name: "Save changes" })
      .should("be.enabled")
      .click();

    cy.wait("@dataset");
    cy.url().should("not.contain", "/metadata");

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
  });
});
