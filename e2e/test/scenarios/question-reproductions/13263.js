import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { restore, openTable } from "e2e/support/helpers";

describe("postgres > user > query", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
        });
      },
    );
  });

  it("should show row details when clicked on its entity key (metabase#13263)", () => {
    // We're clicking on ID: 1 (the first order) => do not change!
    // It is tightly coupled to the assertion ("37.65"), which is "Subtotal" value for that order.
    cy.get(".test-Table-ID").eq(0).click();

    // Wait until "doing science" spinner disappears (DOM is ready for assertions)
    // TODO: if this proves to be reliable, extract it as a helper function for waiting on DOM to render
    cy.findByTestId("loading-indicator").should("not.exist");

    // Assertions
    cy.log("Fails in v0.36.6");
    // This could be omitted because real test is searching for "37.65" on the page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});
