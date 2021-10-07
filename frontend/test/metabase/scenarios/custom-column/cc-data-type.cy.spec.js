import { restore, openTable, popover } from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID, PEOPLE_ID, PRODUCTS_ID } = SAMPLE_DATASET;

describe("scenarios > question > custom column > data type", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should understand string functions", () => {
    openCustomColumnInTable(PRODUCTS_ID);

    enterCustomColumnDetails({
      formula: "concat([Category], [Title])",
      name: "CategoryTitle",
    });

    cy.button("Done").click();

    cy.findByText("Filter").click();
    popover()
      .findByText("CategoryTitle")
      .click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");
    cy.findByPlaceholderText("Enter some text");
  });

  it("should relay the type of a date field", () => {
    openCustomColumnInTable(PEOPLE_ID);

    enterCustomColumnDetails({ formula: "[Birth Date]", name: "DoB" });
    cy.button("Done").click();

    cy.findByText("Filter").click();
    popover()
      .findByText("DoB")
      .click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");

    cy.findByText("Previous");
    cy.findByText("Days");
  });

  it("should handle CASE", () => {
    openCustomColumnInTable(ORDERS_ID);

    enterCustomColumnDetails({
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    cy.findByText("Filter").click();
    popover()
      .findByText("MiscDate")
      .click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");

    cy.findByText("Previous");
    cy.findByText("Days");
  });

  it("should handle COALESCE", () => {
    openCustomColumnInTable(ORDERS_ID);

    enterCustomColumnDetails({
      formula: "COALESCE([Product → Created At], [Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    cy.findByText("Filter").click();
    popover()
      .findByText("MiscDate")
      .click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");

    cy.findByText("Previous");
    cy.findByText("Days");
  });
});

function openCustomColumnInTable(table) {
  openTable({ table, mode: "notebook" });
  cy.findByText("Custom column").click();
}

function enterCustomColumnDetails({ formula, name } = {}) {
  cy.get("[contenteditable='true']")
    .as("formula")
    .type(formula);
  cy.findByPlaceholderText("Something nice and descriptive").type(name);
}
