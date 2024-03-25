import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 29943", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("selects the right column when clicking a column header (metabase#29943)", () => {
    createQuestion(
      {
        type: "model",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Custom: ["+", 1, 1],
          },
          fields: [
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
            ["expression", "Custom", { "base-type": "type/Integer" }],
          ],
          limit: 5, // optimization
        },
      },
      { visitQuestion: true },
    );

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    reorderTotalAndCustomColumns();
    cy.button("Save changes").click();
    cy.wait("@dataset");

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    assertColumnSelected(0, "ID");

    getHeaderCell(1, "Custom").click();
    assertColumnSelected(1, "Custom");

    getHeaderCell(2, "Total").click();
    assertColumnSelected(2, "Total");

    getHeaderCell(0, "ID").click();
    assertColumnSelected(0, "ID");
  });
});

function reorderTotalAndCustomColumns() {
  getHeaderCell(1, "Total").should("exist");
  getHeaderCell(2, "Custom").should("exist");

  // drag & drop the Custom column 100 px to the left to switch it with Total column
  cy.findAllByTestId("header-cell")
    .contains("Custom")
    .then(customColumn => {
      const rect = customColumn[0].getBoundingClientRect();
      cy.wrap(customColumn)
        .trigger("mousedown")
        .trigger("mousemove", { clientX: rect.x - 100, clientY: rect.y })
        .trigger("mouseup");
    });

  getHeaderCell(1, "Custom").should("exist");
  getHeaderCell(2, "Total").should("exist");
}

function assertColumnSelected(columnIndex: number, name: string) {
  getHeaderCell(columnIndex, name)
    .find("div")
    .should("have.css", "background-color")
    .and("eq", "rgb(80, 158, 227)");

  cy.findByLabelText("Display name").should("have.value", name);
}

function getHeaderCell(columnIndex: number, name: string) {
  return cy
    .findAllByTestId("header-cell")
    .eq(columnIndex)
    .should("have.text", name);
}
