import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  visualize,
  withDatabase,
  adhocQuestionHash,
  summarize,
} from "e2e/support/helpers";


describe("issue 34577", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-4");
    cy.signInAsAdmin();
    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
      const tableId = body.find(table => table.name === "nested_id_collection").id;
      openTable({
        database: WRITABLE_DB_ID,
        table: tableId,
        mode: "notebook",
      });
    });
  });

  it.skip("should correctly apply distinct count on a nested _id (metabase#34577)", () => {
    cy.findByRole("button", { name: "Summarize" }).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick the metric you want to see").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Country").click();

    visualize();
    cy.get(".ScalarValue").contains("1");
  });
});
