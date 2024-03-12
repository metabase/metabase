import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { openQuestionActions, popover, restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 29943", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("selects the right column when clicking a column header (metabase#29943)", () => {
    cy.createQuestion(
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

    getHeaderCell(0, "ID")
      .find("div")
      .should("have.css", "background-color")
      .and("eq", "rgb(80, 158, 227)");
    cy.findByLabelText("Display name").should("have.value", "ID");

    getHeaderCell(1, "Custom").click();
    getHeaderCell(1, "Custom")
      .find("div")
      .should("have.css", "background-color")
      .and("eq", "rgb(80, 158, 227)");
    cy.findByLabelText("Display name").should("have.value", "Custom");

    getHeaderCell(2, "Total").click();
    getHeaderCell(2, "Total")
      .find("div")
      .should("have.css", "background-color")
      .and("eq", "rgb(80, 158, 227)");
    cy.findByLabelText("Display name").should("have.value", "Total");
  });
});

function reorderTotalAndCustomColumns() {
  cy.findAllByTestId("header-cell").eq(1).should("have.text", "Total");
  cy.findAllByTestId("header-cell").eq(2).should("have.text", "Custom");

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

  cy.findAllByTestId("header-cell").eq(1).should("have.text", "Custom");
  cy.findAllByTestId("header-cell").eq(2).should("have.text", "Total");
}

function getHeaderCell(index: number, expectedName: string) {
  return cy
    .findAllByTestId("header-cell")
    .eq(index)
    .should("have.text", expectedName);
}
