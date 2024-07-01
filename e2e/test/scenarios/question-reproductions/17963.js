import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  visualize,
  openTable,
  popover,
  getNotebookStep,
} from "e2e/support/helpers";

describe("issue 17963", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();

    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
      const tableId = body.find(table => table.name === "orders").id;
      openTable({
        database: WRITABLE_DB_ID,
        table: tableId,
        mode: "notebook",
      });
    });
  });

  it("should be able to compare two fields using filter expression (metabase#17963)", () => {
    cy.findByRole("button", { name: "Filter" }).click();

    popover().contains("Custom Expression").click();

    typeAndSelect([
      { string: "dis", field: "Discount" },
      { string: "> quan", field: "Quantity" },
    ]);

    cy.get(".ace_text-input").blur();
    cy.button("Done").click();

    getNotebookStep("filter").findByText("Discount is greater than Quantity");

    cy.findByRole("button", { name: "Summarize" }).click();
    popover().findByText("Count of rows").click();

    visualize();

    cy.findByTestId("scalar-value").contains("1,337");
  });
});

function typeAndSelect(arr) {
  arr.forEach(({ string, field }) => {
    cy.get(".ace_text-input").type(string);

    popover().contains(field).click();
  });
}
