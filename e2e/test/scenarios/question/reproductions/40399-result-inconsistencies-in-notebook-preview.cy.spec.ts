import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  getNotebookStep,
  openNotebook,
  createQuestion,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 40399", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not show results from other stages in a stages preview (metabase#40399)", () => {
    createQuestion(
      {
        name: "40399",
        query: {
          "source-table": PRODUCTS_ID,
          joins: [
            {
              fields: "all",
              alias: "Orders",
              "source-table": ORDERS_ID,
              strategy: "left-join",
              condition: [
                "=",
                ["field", PRODUCTS.ID, null],
                ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
              ],
            },
          ],
          filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
        },
      },
      {
        visitQuestion: true,
      },
    );

    openNotebook();

    getNotebookStep("filter", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Widget")
        .should("be.visible");
    });

    getNotebookStep("join", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Gizmo")
        .should("be.visible");

      cy.findByTestId("preview-root").findByText("Widget").should("not.exist");
    });

    getNotebookStep("data", { stage: 0 }).within(() => {
      cy.icon("play").click();
      cy.findByTestId("preview-root")
        .findAllByText("Gizmo")
        .should("be.visible");

      cy.findByTestId("preview-root").findAllByText("Gizmo").should("exist");
      cy.findByTestId("preview-root").findAllByText("Widget").should("exist");
    });
  });
});
