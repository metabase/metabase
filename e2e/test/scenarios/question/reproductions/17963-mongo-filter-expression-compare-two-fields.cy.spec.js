import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { restore, popover, visualize, openTable } from "e2e/support/helpers";

describe("issue 17963", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-4");
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filters to narrow your answer").click();

    popover().contains("Custom Expression").click();

    typeAndSelect([
      { string: "dis", field: "Discount" },
      { string: "> qu", field: "Quantity" },
    ]);
    cy.get(".ace_text-input").blur();

    cy.button("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is greater than Quantity");

    cy.findByRole("button", { name: "Summarize" }).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick the metric you want to see").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    visualize();

    cy.get(".ScalarValue").contains("1,337");
  });
});

function typeAndSelect(arr) {
  arr.forEach(({ string, field }) => {
    cy.get(".ace_text-input").type(string);

    popover().contains(field).click();
  });
}
