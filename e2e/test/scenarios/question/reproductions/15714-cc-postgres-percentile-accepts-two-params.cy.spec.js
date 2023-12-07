import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  enterCustomColumnDetails,
  restore,
  openTable,
} from "e2e/support/helpers";

describe("postgres > question > custom columns", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          mode: "notebook",
        });
      },
    );

    cy.findByRole("button", { name: "Summarize" }).click();
  });

  it("`Percentile` custom expression function should accept two parameters (metabase#15714)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick the metric you want to see").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "Percentile([Subtotal], 0.1)" });
    cy.findByPlaceholderText("Something nice and descriptive")
      .as("name")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Function Percentile expects 1 argument").should("not.exist");
    cy.get("@name").type("Expression name");
    cy.button("Done").should("not.be.disabled").click();
    // Todo: Add positive assertions once this is fixed

    cy.findByTestId("aggregate-step")
      .contains("Expression name")
      .should("exist");
  });
});
