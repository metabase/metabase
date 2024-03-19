import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";
import type { FieldReference } from "metabase-types/api";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const DISCOUNT_FIELD_REF: FieldReference = [
  "field",
  ORDERS.DISCOUNT,
  {
    "base-type": "type/Float",
  },
];

describe("issue 35711", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("can edit metadata of a model with a custom column (metabase#35711)", () => {
    createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            "Custom column": ["-", DISCOUNT_FIELD_REF, 1],
          },
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();
    reorderTaxAndTotalColumns();
    assertNoError();

    cy.findByTestId("editor-tabs-query-name").click();
    assertNoError();
  });
});

function reorderTaxAndTotalColumns() {
  cy.findAllByTestId("header-cell").eq(4).should("have.text", "Tax");
  cy.findAllByTestId("header-cell").eq(5).should("have.text", "Total");

  // drag & drop the Total column 100 px to the left to switch it with Tax column
  cy.findAllByTestId("header-cell")
    .contains("Total")
    .then(totalColumn => {
      const rect = totalColumn[0].getBoundingClientRect();
      cy.wrap(totalColumn)
        .trigger("mousedown")
        .trigger("mousemove", { clientX: rect.x - 100, clientY: rect.y })
        .trigger("mouseup");
    });

  cy.findAllByTestId("header-cell").eq(4).should("have.text", "Total");
  cy.findAllByTestId("header-cell").eq(5).should("have.text", "Tax");
}

function assertNoError() {
  cy.button("Get Answer").should("not.exist");
  cy.get("main")
    .findByText("There was a problem with your question")
    .should("not.exist");
  cy.get(".cellData").should("contain", "37.65");
}
