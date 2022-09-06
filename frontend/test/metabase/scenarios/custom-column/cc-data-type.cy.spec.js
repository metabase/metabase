import {
  restore,
  openTable,
  popover,
  enterCustomColumnDetails,
  filter,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, PEOPLE_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > custom column > data type", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should understand string functions (metabase#13217)", () => {
    openCustomColumnInTable(PRODUCTS_ID);

    enterCustomColumnDetails({
      formula: "concat([Category], [Title])",
      name: "CategoryTitle",
    });

    cy.button("Done").click();

    filter({ mode: "notebook" });

    popover().findByText("CategoryTitle").click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");
    cy.findByPlaceholderText("Enter some text");
  });

  it("should relay the type of a date field", () => {
    openCustomColumnInTable(PEOPLE_ID);

    enterCustomColumnDetails({ formula: "[Birth Date]", name: "DoB" });
    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().findByText("DoB").click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");

    cy.findByText("Relative dates...").click();
    cy.findByText("Past").click();
    cy.findByText("days");
  });

  it("should handle CASE (metabase#13122)", () => {
    openCustomColumnInTable(ORDERS_ID);

    enterCustomColumnDetails({
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().findByText("MiscDate").click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");

    cy.findByText("Relative dates...").click();
    cy.findByText("Past").click();
    cy.findByText("days");
  });

  it("should handle COALESCE", () => {
    openCustomColumnInTable(ORDERS_ID);

    enterCustomColumnDetails({
      formula: "COALESCE([Product → Created At], [Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().findByText("MiscDate").click();

    cy.findByPlaceholderText("Enter a number").should("not.exist");

    cy.findByText("Relative dates...").click();
    cy.findByText("Past").click();
    cy.findByText("days");
  });
});

function openCustomColumnInTable(table) {
  openTable({ table, mode: "notebook" });
  cy.findByText("Custom column").click();
}
