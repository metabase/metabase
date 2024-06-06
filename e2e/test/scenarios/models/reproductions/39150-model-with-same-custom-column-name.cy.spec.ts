import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  restore,
  openNotebook,
  enterCustomColumnDetails,
  visualize,
  saveQuestion,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 39150", { viewportWidth: 1600 }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows custom columns with the same name in nested models (metabase#39150-1)", () => {
    const ccName = "CC Rating";

    createQuestion({
      name: "Source Model",
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [ccName]: [
            "ceil",
            [
              "field",
              PRODUCTS.RATING,
              {
                "base-type": "type/Float",
              },
            ],
          ],
        },
        limit: 2,
      },
    }).then(({ body: { id: sourceModelId } }) => {
      createQuestion(
        {
          name: "Nested Model",
          type: "model",
          query: {
            "source-table": `card__${sourceModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "floor([Rating])",
      name: ccName,
    });

    cy.button("Done").click();

    visualize();

    cy.findAllByTestId("header-cell")
      .filter(`:contains('${ccName}')`)
      .should("have.length", 2);
  });

  it.skip("allows custom columns with the same name as the aggregation column from the souce model (metabase#39150-2)", () => {
    createQuestion({
      name: "Source Model",
      type: "model",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CATEGORY,
            {
              "base-type": "type/Text",
            },
          ],
        ],
        limit: 2,
      },
    }).then(({ body: { id: sourceModelId } }) => {
      createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${sourceModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "[Count] + 1",
      name: "Count",
    });

    cy.button("Done").click();

    visualize();

    cy.findAllByTestId("header-cell")
      .filter(":contains('Count')")
      .should("have.length", 2);

    saveQuestion("Nested Model", { wrapId: true, idAlias: "nestedModelId" });

    cy.log("Make sure this works for the deeply nested models as well");
    cy.get("@nestedModelId").then(nestedModelId => {
      createQuestion(
        {
          type: "model",
          query: {
            "source-table": `card__${nestedModelId}`,
          },
        },
        { visitQuestion: true },
      );
    });

    openNotebook();
    cy.findByTestId("action-buttons").findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "[Count] + 5",
      name: "Count",
    });

    cy.button("Done").click();

    visualize();

    cy.findAllByTestId("header-cell")
      .filter(":contains('Count')")
      .should("have.length", 3);
  });
});
